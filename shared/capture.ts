export interface CaptureContext {
  purpose: "create" | "update";
  name: string;
  worldId?: string;
  revision?: number;
}
export interface PairingDetails {
  id: string;
  ownerToken: string;
  expiresAt: number;
  context: CaptureContext;
  links: { url: string; qr: string; label: string }[];
  network: boolean;
}
