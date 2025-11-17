import { Client } from "../types";
import { clients } from "../stores";

/**
 * Helper: find a client by client_id.
 */
export function findClientById(clientId: string): Client | undefined {
  return clients.find((client) => client.clientId === clientId);
}

