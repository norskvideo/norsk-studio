import type { AxinomConfig } from "@norskvideo/norsk-studio/lib/shared/config";
import { parseCpix } from "./cpix";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export async function axinomInit(config: AxinomConfig | undefined) {
  const tenantId = config?.tenantId;
  const managementKey = config?.managementKey;
  if (!tenantId) {
    throw new Error("Missing Tenant ID for Axinom DRM authentication");
  }
  if (!managementKey) {
    throw new Error("Missing Tenant ID for Axinom DRM authentication");
  }
  const auth = Buffer.from(`${tenantId}:${managementKey}`, "utf-8").toString("base64");

  const encryptionKeyIds = { audio: randomUUID(), video: randomUUID() };

  const endpoint = "https://key-server-management.axprod.net/api/SpekeV2";

  // Build a CPIX document containing the keys and systems
  const request = `
    <?xml version="1.0"?>
    <cpix:CPIX contentId="norskStudio" version="2.3" xmlns:cpix="urn:dashif:org:cpix" xmlns:pskc="urn:ietf:params:xml:ns:keyprov:pskc">
      <cpix:ContentKeyList>
        <cpix:ContentKey kid="${encryptionKeyIds.audio}" commonEncryptionScheme="cbcs"/>
        <cpix:ContentKey kid="${encryptionKeyIds.video}" commonEncryptionScheme="cbcs"/>
      </cpix:ContentKeyList>
      <cpix:DRMSystemList>
        <cpix:DRMSystem kid="${encryptionKeyIds.audio}" systemId="94ce86fb-07ff-4f43-adb8-93d2fa968ca2">
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.audio}" systemId="9a04f079-9840-4286-ab92-e65be0885f95">
          <cpix:PSSH/>
          <cpix:ContentProtectionData/>
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
          <cpix:SmoothStreamingProtectionHeaderData/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.audio}" systemId="edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
          <cpix:PSSH/>
          <cpix:ContentProtectionData/>
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.video}" systemId="94ce86fb-07ff-4f43-adb8-93d2fa968ca2">
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.video}" systemId="9a04f079-9840-4286-ab92-e65be0885f95">
          <cpix:PSSH/>
          <cpix:ContentProtectionData/>
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
          <cpix:SmoothStreamingProtectionHeaderData/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.video}" systemId="edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
          <cpix:PSSH/>
          <cpix:ContentProtectionData/>
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
        </cpix:DRMSystem>
      </cpix:DRMSystemList>
      <cpix:ContentKeyUsageRuleList>
        <cpix:ContentKeyUsageRule kid="${encryptionKeyIds.video}" intendedTrackType="VIDEO">
          <cpix:VideoFilter />
        </cpix:ContentKeyUsageRule>
        <cpix:ContentKeyUsageRule kid="${encryptionKeyIds.audio}" intendedTrackType="AUDIO">
          <cpix:AudioFilter />
        </cpix:ContentKeyUsageRule>
      </cpix:ContentKeyUsageRuleList>
    </cpix:CPIX>
  `.split('\n').map(line => line.substring(4)).join('\n').trim();
  const response_inflight = await fetch(endpoint, {
    method: "POST",
    withCredentials: true,
    credentials: "include",
    headers: {
      "Content-Type": "application/xml",
      "Authorization": "Basic " + auth,
      "X-Speke-Version": "2.0",
    },
    body: request,
  } as RequestInit);
  if (!response_inflight.ok) {
    throw new Error(response_inflight.status + " " + response_inflight.headers.get("x-axdrm-errormessage") || "unknown error from Axinom API");
  }
  const response = await response_inflight.text();
  return parseCpix({ cpix: response, encryptionKeyIds, token: mkToken(config, [ encryptionKeyIds.audio, encryptionKeyIds.video ]) });
}

function mkToken(config: AxinomConfig | undefined, keys: string[]) {
  const comKey = config?.comKey;
  const comKeyId = config?.comKeyId;
  if (!comKey || !comKeyId) {
    return;
  }
  // Generates an example token for client playback
  // See Axinom documentation for fields
  const msg = {
    "version": 1,
    "begin_date": "2000-01-01T09:53:22+03:00",
    "expiration_date": "2025-12-31T23:59:40+03:00",
    "com_key_id": comKeyId,
    "message": {
      "type": "entitlement_message",
      "version": 2,
      "license": {
        "duration": 3600
      },
      "content_keys_source": {
        "inline": keys.map(id => ({ id }))
      }
    }
  };
  const communicationKey = Buffer.from(comKey, "base64");
  return jwt.sign(msg, communicationKey, {
    "algorithm": "HS256",
    "noTimestamp": true
  });
}
