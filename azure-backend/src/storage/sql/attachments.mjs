import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { BlobServiceClient, BlobSASPermissions } from '@azure/storage-blob';
import { ApiError } from '../../tokens.mjs';
export class BlobAttachments {
    constructor(profile, workspace) { this.container = BlobServiceClient.fromConnectionString(profile.blobConnectionString).getContainerClient(profile.container); this.workspace = workspace; }
    async health() { const properties = await this.container.getProperties(); if (properties.blobPublicAccess)
        throw new ApiError('DeskPilot attachments require a private Blob container.', 400); }
    async upload(ticketId, file) {
        if (!file?.name || /[\\/\r\n]/.test(file.name) || file.size > 5 * 1024 * 1024)
            throw new ApiError('Invalid attachment (maximum 5 MB).', 400);
        const key = this.workspace + '/' + ticketId + '/' + randomUUID();
        const blob = this.container.getBlockBlobClient(key);
        await blob.uploadData(Buffer.from(await file.arrayBuffer()), { blobHTTPHeaders: { blobContentType: 'application/octet-stream', blobContentDisposition: "attachment; filename*=UTF-8''" + encodeURIComponent(file.name) } });
        return { key, name: file.name, size: file.size, created: new Date().toISOString() };
    }
    async link(file) {
        if (!file.key.startsWith(this.workspace + '/'))
            throw new ApiError('Invalid attachment location.');
        const url = await this.container.getBlobClient(file.key).generateSasUrl({ permissions: BlobSASPermissions.parse('r'), expiresOn: new Date(Date.now() + 5 * 60000), contentDisposition: "attachment; filename*=UTF-8''" + encodeURIComponent(file.name) });
        const { key, ...metadata } = file;
        return { ...metadata, url, contentUrl: url };
    }
    async remove(file) { if (!file.key.startsWith(this.workspace + '/'))
        throw new ApiError('Invalid attachment location.'); await this.container.getBlobClient(file.key).deleteIfExists(); }
    async verify(file, hash) {
        if (!file.key.startsWith(this.workspace + '/')) throw new ApiError('Invalid attachment location.');
        const bytes = await this.container.getBlockBlobClient(file.key).downloadToBuffer();
        if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== hash) throw new ApiError('Migrated attachment verification failed.', 409);
    }
}
