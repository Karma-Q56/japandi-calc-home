#!/usr/bin/env node
// Phase D17: print a new VAPID key pair for web push.
// The keys are printed to the terminal only. Nothing is written to a file.
// Put them in the host's secret store (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) and
// set VAPID_SUBJECT to a mailto: or https: address you control.
// The public key also goes in VITE_VAPID_PUBLIC_KEY for the browser.

import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const jwk = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });

// Uncompressed point: 0x04 || x || y, base64url, as the browser and VAPID expect.
const publicRaw = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);

console.log("VAPID_PUBLIC_KEY=" + publicRaw.toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + priv.d);
console.log("");
console.log("Keep the private key secret. Do not commit it or paste it into chat.");
