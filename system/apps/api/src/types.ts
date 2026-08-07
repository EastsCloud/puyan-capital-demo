import type { Role } from "@isater/domain";

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  locale: "zh-CN" | "en";
  mustChangePassword: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser: AuthenticatedUser | null;
    sessionId: string | null;
  }
}
