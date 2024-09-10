import type { EzDrmConfig } from "@norskvideo/norsk-studio/lib/shared/config";
import { parseCpix } from "./cpix";
import { randomUUID } from "node:crypto";

export async function ezdrmInit(config: EzDrmConfig | undefined) {
  const token = config?.token;
  if (!token) {
    throw new Error("Missing Token for EZDRM authentication");
  }

  const encryptionKeyIds = { audio: randomUUID(), video: randomUUID() };
  const ezdrmEndpoint = "https://cpix.ezdrm.com/KeyGenerator/cpix2.aspx";
  const params = new URLSearchParams({
    k: `empty,audio1=${encryptionKeyIds.audio},video1=${encryptionKeyIds.video}`,
    c: "norskStudio",
    t: token,
  }).toString();

  const url = `${ezdrmEndpoint}?${params}`;

  const response_inflight = await fetch(url);
  if (!response_inflight.ok) {
    throw new Error(response_inflight.status + " " + response_inflight.statusText);
  }
  const response = await response_inflight.text();
  return parseCpix({ cpix: response, encryptionKeyIds, token: config?.pX });
}
