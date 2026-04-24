pub(crate) fn image_dimensions_from_bytes(bytes: &[u8]) -> Option<(u32, u32)> {
    png_dimensions(bytes)
        .or_else(|| jpeg_dimensions(bytes))
        .or_else(|| webp_dimensions(bytes))
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

    if bytes.len() < 24 || &bytes[0..8] != PNG_SIGNATURE || &bytes[12..16] != b"IHDR" {
        return None;
    }

    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    non_zero_dimensions(width, height)
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 4 || bytes[0] != 0xff || bytes[1] != 0xd8 {
        return None;
    }

    let mut offset = 2;
    while offset < bytes.len() {
        while offset < bytes.len() && bytes[offset] != 0xff {
            offset += 1;
        }
        while offset < bytes.len() && bytes[offset] == 0xff {
            offset += 1;
        }
        if offset >= bytes.len() {
            return None;
        }

        let marker = bytes[offset];
        offset += 1;

        if marker == 0xd9 || marker == 0xda {
            return None;
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }
        if offset + 2 > bytes.len() {
            return None;
        }

        let segment_length = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        if segment_length < 2 || offset + segment_length > bytes.len() {
            return None;
        }

        if is_jpeg_start_of_frame(marker) {
            if segment_length < 7 {
                return None;
            }

            let data_start = offset + 2;
            let height = u16::from_be_bytes([bytes[data_start + 1], bytes[data_start + 2]]) as u32;
            let width = u16::from_be_bytes([bytes[data_start + 3], bytes[data_start + 4]]) as u32;
            return non_zero_dimensions(width, height);
        }

        offset += segment_length;
    }

    None
}

fn webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 20 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }

    let mut offset = 12;
    while offset + 8 <= bytes.len() {
        let chunk_type = &bytes[offset..offset + 4];
        let chunk_size =
            u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().ok()?) as usize;
        let data_start = offset + 8;
        let data_end = data_start.checked_add(chunk_size)?;
        if data_end > bytes.len() {
            return None;
        }

        let dimensions = match chunk_type {
            b"VP8X" => webp_vp8x_dimensions(&bytes[data_start..data_end]),
            b"VP8L" => webp_vp8l_dimensions(&bytes[data_start..data_end]),
            b"VP8 " => webp_vp8_dimensions(&bytes[data_start..data_end]),
            _ => None,
        };
        if dimensions.is_some() {
            return dimensions;
        }

        offset = data_end + (chunk_size % 2);
    }

    None
}

fn webp_vp8x_dimensions(chunk: &[u8]) -> Option<(u32, u32)> {
    if chunk.len() < 10 {
        return None;
    }

    let width = read_u24_le(&chunk[4..7])? + 1;
    let height = read_u24_le(&chunk[7..10])? + 1;
    non_zero_dimensions(width, height)
}

fn webp_vp8l_dimensions(chunk: &[u8]) -> Option<(u32, u32)> {
    if chunk.len() < 5 || chunk[0] != 0x2f {
        return None;
    }

    let bits = u32::from_le_bytes(chunk[1..5].try_into().ok()?);
    let width = (bits & 0x3fff) + 1;
    let height = ((bits >> 14) & 0x3fff) + 1;
    non_zero_dimensions(width, height)
}

fn webp_vp8_dimensions(chunk: &[u8]) -> Option<(u32, u32)> {
    if chunk.len() < 10 || chunk[3..6] != [0x9d, 0x01, 0x2a] {
        return None;
    }

    let width = (u16::from_le_bytes(chunk[6..8].try_into().ok()?) & 0x3fff) as u32;
    let height = (u16::from_le_bytes(chunk[8..10].try_into().ok()?) & 0x3fff) as u32;
    non_zero_dimensions(width, height)
}

fn read_u24_le(bytes: &[u8]) -> Option<u32> {
    if bytes.len() != 3 {
        return None;
    }

    Some(bytes[0] as u32 | ((bytes[1] as u32) << 8) | ((bytes[2] as u32) << 16))
}

fn is_jpeg_start_of_frame(marker: u8) -> bool {
    matches!(
        marker,
        0xc0 | 0xc1 | 0xc2 | 0xc3 | 0xc5 | 0xc6 | 0xc7 | 0xc9 | 0xca | 0xcb | 0xcd | 0xce | 0xcf
    )
}

fn non_zero_dimensions(width: u32, height: u32) -> Option<(u32, u32)> {
    if width == 0 || height == 0 {
        None
    } else {
        Some((width, height))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_png_dimensions() {
        let bytes = [
            0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 13, b'I', b'H', b'D', b'R',
            0, 0, 5, 0, 0, 0, 3, 0,
        ];

        assert_eq!(image_dimensions_from_bytes(&bytes), Some((1280, 768)));
    }

    #[test]
    fn reads_jpeg_dimensions() {
        let bytes = [
            0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x02,
            0x58, 0x03, 0x20, 0x03, 0xff, 0xd9,
        ];

        assert_eq!(image_dimensions_from_bytes(&bytes), Some((800, 600)));
    }

    #[test]
    fn reads_webp_vp8x_dimensions() {
        let bytes = [
            b'R', b'I', b'F', b'F', 18, 0, 0, 0, b'W', b'E', b'B', b'P', b'V', b'P', b'8', b'X',
            10, 0, 0, 0, 0, 0, 0, 0, 0xff, 0x03, 0x00, 0xff, 0x01, 0x00,
        ];

        assert_eq!(image_dimensions_from_bytes(&bytes), Some((1024, 512)));
    }

    #[test]
    fn rejects_unknown_bytes() {
        assert_eq!(image_dimensions_from_bytes(b"not an image"), None);
    }
}
