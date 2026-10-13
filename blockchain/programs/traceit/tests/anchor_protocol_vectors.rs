use serde_json::Value;
use sha2::{Digest, Sha512};

const AUDIT_ROOT_DOMAIN: &[u8] = b"TRACEIT_AUDIT_ROOT_V1";
const ANCHOR_DOMAIN: &[u8] = b"TRACEIT_ANCHOR_V1";

fn decode_hex(value: &str) -> Vec<u8> {
    assert_eq!(value.len() % 2, 0);
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).unwrap())
        .collect()
}

fn sha512(parts: &[&[u8]]) -> Vec<u8> {
    let mut hasher = Sha512::new();
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().to_vec()
}

fn derive(vector: &Value) -> (Vec<u8>, Vec<u8>) {
    let schema_version = (vector["schemaVersion"].as_u64().unwrap() as u16).to_be_bytes();
    let start = vector["startSequence"]
        .as_str()
        .unwrap()
        .parse::<u64>()
        .unwrap()
        .to_be_bytes();
    let end = vector["endSequence"]
        .as_str()
        .unwrap()
        .parse::<u64>()
        .unwrap()
        .to_be_bytes();
    let count = (vector["eventCount"].as_u64().unwrap() as u32).to_be_bytes();
    let event_hashes: Vec<Vec<u8>> = vector["eventHashesHex"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| decode_hex(value.as_str().unwrap()))
        .collect();
    let mut root_parts: Vec<&[u8]> = vec![AUDIT_ROOT_DOMAIN, &schema_version, &start, &end, &count];
    root_parts.extend(event_hashes.iter().map(Vec::as_slice));
    let audit_root = sha512(&root_parts);
    let batch_digest = sha512(&[
        ANCHOR_DOMAIN,
        &schema_version,
        &start,
        &end,
        &count,
        &audit_root,
    ]);
    (audit_root, batch_digest[..32].to_vec())
}

#[test]
fn rust_matches_shared_anchor_protocol_vectors() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/anchor-protocol-v1.json"
    ))
    .unwrap();

    for vector in fixture["valid"].as_array().unwrap() {
        let (audit_root, batch_key) = derive(vector);
        assert_eq!(
            audit_root,
            decode_hex(vector["auditRootHex"].as_str().unwrap()),
            "audit root mismatch for {}",
            vector["name"].as_str().unwrap()
        );
        assert_eq!(
            batch_key,
            decode_hex(vector["batchKeyHex"].as_str().unwrap()),
            "batch key mismatch for {}",
            vector["name"].as_str().unwrap()
        );
    }
}

#[test]
fn altered_root_does_not_match_recomputed_root() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/anchor-protocol-v1.json"
    ))
    .unwrap();
    let source = fixture["valid"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["name"] == "multiple_events")
        .unwrap();
    let altered = fixture["invalid"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["name"] == "altered_root")
        .unwrap();
    let (audit_root, _) = derive(source);
    assert_ne!(
        audit_root,
        decode_hex(altered["auditRootHex"].as_str().unwrap())
    );
}
