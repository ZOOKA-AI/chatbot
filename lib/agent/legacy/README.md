# Legacy ReAct agent decision

Decision: do not connect or retain a separate legacy ReAct loop. The live chat
route already uses AI SDK `streamText` and its tool-calling cycle, and
`saveMemory` plus `listAgentMemories` provide workspace-scoped memory through
the existing `agent_memory` table. A second agent loop would duplicate that
behavior and create another path to maintain without adding a capability the
current chat flow lacks.

The existing chat route remains the single agent path:
`app/(chat)/api/chat/route.ts`. It derives `userId` and `organizationId` from
the authenticated workspace context, uses the existing memory service, and
continues to persist chat messages through `saveMessages`. No separate message
store, memory table, or token wallet is needed.
