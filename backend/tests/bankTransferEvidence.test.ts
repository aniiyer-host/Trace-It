import { DocumentService } from '../src/services/documentService.js';
import { StorageService } from '../src/services/storageService.js';
import { HashService } from '../src/services/hashService.js';

describe('private bank transfer evidence storage', () => {
  const previousKey = process.env.AES_DOCUMENT_KEY;
  let encrypted: Buffer;
  let upload: jest.SpyInstance;
  let download: jest.SpyInstance;

  beforeEach(() => {
    process.env.AES_DOCUMENT_KEY = 'a'.repeat(64);
    encrypted = Buffer.alloc(0);
    upload = jest
      .spyOn(StorageService.prototype, 'uploadFile')
      .mockImplementation(async (contents) => {
        encrypted = contents;
      });
    download = jest
      .spyOn(StorageService.prototype, 'downloadFile')
      .mockImplementation(async () => encrypted);
  });

  afterEach(() => {
    upload.mockRestore();
    download.mockRestore();
    if (previousKey === undefined) delete process.env.AES_DOCUMENT_KEY;
    else process.env.AES_DOCUMENT_KEY = previousKey;
  });

  const file = (buffer: Buffer) =>
    ({
      buffer,
      originalname: '../../private-receipt.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
    }) as Express.Multer.File;

  it('encrypts evidence at rest and decrypts it only through the document service', async () => {
    const original = Buffer.from('bank transfer receipt bytes');
    const metadata = await DocumentService.prepareBankTransferEvidence(
      file(original),
      'ngo-id',
      'transfer-id',
    );

    expect(encrypted).not.toEqual(original);
    expect(metadata.storagePath).toBe(
      'ngo-id/BANK_TRANSFER_EVIDENCE/transfer-id.pdf',
    );
    expect(upload).toHaveBeenCalledWith(
      encrypted,
      metadata.storagePath,
      'application/octet-stream',
    );
    await expect(
      DocumentService.readBankTransferEvidence(metadata),
    ).resolves.toEqual(original);
  });

  it('refuses to return evidence whose decrypted content does not match its stored hash', async () => {
    const original = Buffer.from('bank transfer receipt bytes');
    await DocumentService.prepareBankTransferEvidence(
      file(original),
      'ngo-id',
      'transfer-id',
    );

    await expect(
      DocumentService.readBankTransferEvidence({
        storageBucket: 'proof-docs',
        storagePath: 'ngo-id/BANK_TRANSFER_EVIDENCE/transfer-id.pdf',
        sha512Hash: HashService.sha512('different content'),
      }),
    ).rejects.toThrow('failed its integrity check');
  });
});
