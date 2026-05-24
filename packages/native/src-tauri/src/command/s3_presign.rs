use chrono::{DateTime, Utc};
use reqwest::Url;
use ring::{digest, hmac};

const ALGORITHM: &str = "AWS4-HMAC-SHA256";
const SERVICE: &str = "s3";
const TERMINATOR: &str = "aws4_request";
const UNSIGNED_PAYLOAD: &str = "UNSIGNED-PAYLOAD";

pub struct PresignPutObjectParams<'a> {
    pub key: &'a str,
    pub bucket: &'a str,
    pub region: &'a str,
    pub endpoint: &'a str,
    pub access_key: &'a str,
    pub secret_key: &'a str,
    pub expires_seconds: u32,
}

pub fn presign_put_object_url(
    params: PresignPutObjectParams<'_>,
    now: DateTime<Utc>,
) -> Result<String, String> {
    let endpoint = normalize_endpoint(params.endpoint)?;
    let host = host_header(&endpoint)?;
    let date = now.format("%Y%m%d").to_string();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let credential_scope = format!("{}/{}/{}/{}", date, params.region, SERVICE, TERMINATOR);
    let credential = format!("{}/{}", params.access_key, credential_scope);
    let canonical_uri = format!(
        "/{}/{}",
        uri_encode(params.bucket, true),
        uri_encode(params.key, false)
    );

    let query_pairs = [
        ("X-Amz-Algorithm", ALGORITHM.to_string()),
        ("X-Amz-Content-Sha256", UNSIGNED_PAYLOAD.to_string()),
        ("X-Amz-Credential", credential),
        ("X-Amz-Date", amz_date),
        ("X-Amz-Expires", params.expires_seconds.to_string()),
        ("X-Amz-SignedHeaders", "host".to_string()),
        ("x-id", "PutObject".to_string()),
    ];
    let canonical_query = canonical_query_string(&query_pairs);
    let canonical_request = format!(
        "PUT\n{}\n{}\nhost:{}\n\nhost\n{}",
        canonical_uri, canonical_query, host, UNSIGNED_PAYLOAD
    );
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        ALGORITHM,
        query_pairs[3].1,
        credential_scope,
        sha256_hex(canonical_request.as_bytes())
    );
    let signature = sign(
        params.secret_key,
        &date,
        params.region,
        string_to_sign.as_bytes(),
    );

    Ok(format!(
        "{}{}?{}&X-Amz-Signature={}&{}",
        endpoint_base(&endpoint, &host),
        canonical_uri,
        canonical_query_string(&query_pairs[..5]),
        signature,
        canonical_query_string(&query_pairs[5..])
    ))
}

fn normalize_endpoint(endpoint: &str) -> Result<Url, String> {
    let parsed_endpoint = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.to_string()
    } else {
        format!("https://{}", endpoint)
    };
    let url = Url::parse(&parsed_endpoint).map_err(|_| {
        format!(
            "Invalid endpoint URL: '{}'. Please check your S3 endpoint configuration.",
            parsed_endpoint
        )
    })?;
    if url.cannot_be_a_base() || url.query().is_some() || url.fragment().is_some() {
        return Err(format!(
            "Unsupported endpoint URL: '{}'. Endpoint must be a plain S3 origin.",
            parsed_endpoint
        ));
    }
    if !url.path().is_empty() && url.path() != "/" {
        return Err(format!(
            "Unsupported endpoint URL path: '{}'. Endpoint must not include a path.",
            parsed_endpoint
        ));
    }
    Ok(url)
}

fn endpoint_base(endpoint: &Url, host: &str) -> String {
    format!("{}://{}", endpoint.scheme(), host)
}

fn host_header(endpoint: &Url) -> Result<String, String> {
    let host = endpoint
        .host_str()
        .ok_or_else(|| "Endpoint URL must include a host.".to_string())?;
    Ok(match endpoint.port() {
        Some(port) => format!("{}:{}", host, port),
        None => host.to_string(),
    })
}

fn canonical_query_string(pairs: &[(&str, String)]) -> String {
    let mut encoded_pairs = pairs
        .iter()
        .map(|(key, value)| (uri_encode(key, true), uri_encode(value, true)))
        .collect::<Vec<_>>();
    encoded_pairs.sort();
    encoded_pairs
        .into_iter()
        .map(|(key, value)| format!("{}={}", key, value))
        .collect::<Vec<_>>()
        .join("&")
}

fn sign(secret_key: &str, date: &str, region: &str, string_to_sign: &[u8]) -> String {
    let date_key = hmac_sha256(format!("AWS4{}", secret_key).as_bytes(), date.as_bytes());
    let region_key = hmac_sha256(&date_key, region.as_bytes());
    let service_key = hmac_sha256(&region_key, SERVICE.as_bytes());
    let signing_key = hmac_sha256(&service_key, TERMINATOR.as_bytes());
    hex(&hmac_sha256(&signing_key, string_to_sign))
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let key = hmac::Key::new(hmac::HMAC_SHA256, key);
    hmac::sign(&key, data).as_ref().to_vec()
}

fn sha256_hex(data: &[u8]) -> String {
    hex(digest::digest(&digest::SHA256, data).as_ref())
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn uri_encode(value: &str, encode_slash: bool) -> String {
    let mut output = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                output.push(byte as char)
            }
            b'/' if !encode_slash => output.push('/'),
            _ => {
                output.push('%');
                output.push(upper_hex(byte >> 4));
                output.push(upper_hex(byte & 0x0f));
            }
        }
    }
    output
}

fn upper_hex(value: u8) -> char {
    match value {
        0..=9 => (b'0' + value) as char,
        10..=15 => (b'A' + value - 10) as char,
        _ => unreachable!(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn fixed_now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 5, 24, 10, 20, 30)
            .single()
            .unwrap()
    }

    fn params<'a>(key: &'a str) -> PresignPutObjectParams<'a> {
        PresignPutObjectParams {
            key,
            bucket: "example-bucket",
            region: "cn-east-1",
            endpoint: "https://s3.bitiful.net",
            access_key: "AKIDEXAMPLE",
            secret_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            expires_seconds: 3600,
        }
    }

    #[test]
    fn signs_simple_key_like_aws_sdk() {
        let url = presign_put_object_url(params("photos/a.jpg"), fixed_now()).unwrap();

        assert_eq!(
            url,
            "https://s3.bitiful.net/example-bucket/photos/a.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIDEXAMPLE%2F20260524%2Fcn-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260524T102030Z&X-Amz-Expires=3600&X-Amz-Signature=4cec7dc46247f71515d94bf84798f90c3dfdcd326eaafa8474fe7529e65d2d71&X-Amz-SignedHeaders=host&x-id=PutObject"
        );
    }

    #[test]
    fn signs_special_characters_like_aws_sdk() {
        let url = presign_put_object_url(params("中文 空格+(1)#%.jpg"), fixed_now()).unwrap();

        assert_eq!(
            url,
            "https://s3.bitiful.net/example-bucket/%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC%2B%281%29%23%25.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIDEXAMPLE%2F20260524%2Fcn-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260524T102030Z&X-Amz-Expires=3600&X-Amz-Signature=2abc19b493bafc2f2179147702089aeb12f2c1e93141d22db86879c0cdd3b685&X-Amz-SignedHeaders=host&x-id=PutObject"
        );
    }

    #[test]
    fn normalizes_endpoint_without_scheme() {
        let mut params = params("photos/a.jpg");
        params.endpoint = "s3.bitiful.net";
        let url = presign_put_object_url(params, fixed_now()).unwrap();

        assert!(url.starts_with("https://s3.bitiful.net/example-bucket/photos/a.jpg?"));
    }

    #[test]
    fn rejects_endpoint_with_path() {
        let mut params = params("photos/a.jpg");
        params.endpoint = "https://s3.bitiful.net/base";

        assert!(presign_put_object_url(params, fixed_now()).is_err());
    }
}
