// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

const FORMAT = 'beacon-encrypted-export';
const ITERATIONS = 600_000;

export type EncryptedExport = {
  format: typeof FORMAT;
  version: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  label: string;
  data: string;
};

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptExport(
  plaintext: string,
  password: string,
  label: string,
  iterations = ITERATIONS
): Promise<EncryptedExport> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(label) },
      key,
      new TextEncoder().encode(plaintext)
    )
  );
  return {
    format: FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    label,
    data: toBase64(ciphertext),
  };
}

export function isEncryptedExport(value: unknown): value is EncryptedExport {
  return (
    typeof value === 'object' &&
    value != null &&
    (value as { format?: unknown }).format === FORMAT &&
    (value as { version?: unknown }).version === 1
  );
}

export async function decryptExport(
  file: EncryptedExport,
  password: string
): Promise<string> {
  const key = await deriveKey(
    password,
    fromBase64(file.kdf.salt),
    file.kdf.iterations
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(file.cipher.iv),
      additionalData: new TextEncoder().encode(file.label),
    },
    key,
    fromBase64(file.data)
  );
  return new TextDecoder().decode(plaintext);
}
