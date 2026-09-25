export const markDisbursementSettled = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id;
    const disbursementId = req.params.id as string;
    
    if (!adminId) return res.status(401).json({ error: "User not authenticated" });
    
    const disbursement = await prisma.disbursement.findUnique({
      where: { id: disbursementId }
    });
    
    if (!disbursement) return res.status(404).json({ error: "Disbursement not found" });
    if (disbursement.status !== DisbursementStatus.APPROVED) {
      return res.status(400).json({ error: "Disbursement is not APPROVED" });
    }
    
    // Update status to SETTLED
    const updated = await prisma.disbursement.update({
      where: { id: disbursementId },
      data: { status: DisbursementStatus.SETTLED }
    });
    
    // Write audit log
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "disbursement",
      entityId: disbursementId,
      action: "DISBURSEMENT_SETTLED_MANUAL_OVERRIDE",
      metadata: { note: "Manual override triggered to settle disbursement before Razorpay integration." }
    });
    
    return res.status(200).json({ message: "Disbursement marked as settled successfully", disbursement: updated });
  } catch (error) {
    console.error("Error settling disbursement:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
