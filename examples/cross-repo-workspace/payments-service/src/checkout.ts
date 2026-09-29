import { authenticate } from "@fixmap-example/auth";

export function checkout(token: string): "accepted" | "rejected" {
  return authenticate(token) ? "accepted" : "rejected";
}
