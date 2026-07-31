import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateJwk = JSON.stringify(privateKey.export({ format: "jwk" }));
const publicJwk = JSON.stringify(publicKey.export({ format: "jwk" }));
const adminToken = randomBytes(32).toString("hex");

console.log("LICENSE_ADMIN_TOKEN=");
console.log(adminToken);
console.log("\nLICENSE_SIGNING_PRIVATE_JWK=");
console.log(privateJwk);
console.log("\nLICENSE_SIGNING_PUBLIC_JWK=");
console.log(publicJwk);
console.log("\nBack up the private JWK offline. Never add it to Git or the customer app.");
