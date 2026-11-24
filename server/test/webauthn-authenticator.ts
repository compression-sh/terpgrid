/**
 * Software-Authenticator für Tests: erzeugt echte WebAuthn-Antworten (P-256/ES256,
 * CBOR-Attestation „none“, signierte Assertions), wie sie ein Browser liefern würde.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const sha = (d: Buffer | string) => createHash('sha256').update(d).digest();

export interface SoftCredential {
  id: Buffer;
  privateKey: KeyObject;
  counter: number;
  userHandle?: string;
}

export class SoftAuthenticator {
  constructor(
    readonly origin: string,
    readonly rpID: string,
  ) {}

  private authData(flags: number, counter: number, attested?: Buffer) {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter);
    return Buffer.concat([sha(this.rpID), Buffer.from([flags]), c, attested ?? Buffer.alloc(0)]);
  }

  /** Antwort auf navigator.credentials.create() */
  register(options: { challenge: string; user: { id: string } }, opts: { origin?: string; rpID?: string; uv?: boolean } = {}) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]]));
    const credId = randomBytes(32);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(credId.length);
    const attested = Buffer.concat([Buffer.alloc(16), len, credId, Buffer.from(cose)]);
    const self = new SoftAuthenticator(this.origin, opts.rpID ?? this.rpID);
    const authData = self.authData(0x01 | (opts.uv === false ? 0 : 0x04) | 0x40, 0, attested);
    const attObj = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]) as never);
    const clientData = JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: opts.origin ?? this.origin, crossOrigin: false });
    const cred: SoftCredential = { id: credId, privateKey, counter: 0, userHandle: options.user.id };
    return {
      cred,
      response: {
        id: b64u(credId),
        rawId: b64u(credId),
        type: 'public-key',
        response: { clientDataJSON: b64u(Buffer.from(clientData)), attestationObject: b64u(attObj), transports: ['internal'] },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      },
    };
  }

  /** Antwort auf navigator.credentials.get() */
  assert(cred: SoftCredential, challenge: string, opts: { origin?: string; rpID?: string; counter?: number; signWith?: KeyObject; uv?: boolean } = {}) {
    cred.counter = opts.counter ?? cred.counter + 1;
    const self = new SoftAuthenticator(this.origin, opts.rpID ?? this.rpID);
    const authData = self.authData(0x01 | (opts.uv === false ? 0 : 0x04), cred.counter);
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: opts.origin ?? this.origin, crossOrigin: false }));
    const signature = sign('sha256', Buffer.concat([authData, sha(clientData)]), opts.signWith ?? cred.privateKey);
    return {
      id: b64u(cred.id),
      rawId: b64u(cred.id),
      type: 'public-key',
      response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: cred.userHandle },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
