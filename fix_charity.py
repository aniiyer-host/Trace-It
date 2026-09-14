import sys

def fix_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    start_idx = -1
    for i, line in enumerate(lines):
        if "action: \"ATTESTATION_NGO_SIGNED\"," in line:
            start_idx = i - 6
            break
            
    if start_idx == -1:
        print("Not found")
        return
        
    end_idx = start_idx
    while "res.json(updated);" not in lines[end_idx]:
        end_idx += 1
        
    replacement = """    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: ngoId,
      entityType: "attestation",
      entityId: updated.id,
      action: "ATTESTATION_NGO_SIGNED",
      metadata: { donationId, type: rawType },
    });

    if (rawType === 'RECEIPT') {
      await writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        actorId: 'system',
        entityType: "attestation",
        entityId: updated.id,
        action: "ATTESTATION_APPROVED",
        metadata: { donationId, type: rawType, autoApproved: true },
      });
    }

    res.json(updated);
"""
    new_lines = lines[:start_idx] + [replacement] + lines[end_idx+1:]
    with open(filepath, 'w') as f:
        f.writelines(new_lines)

fix_file('backend/src/routes/charity.ts')
