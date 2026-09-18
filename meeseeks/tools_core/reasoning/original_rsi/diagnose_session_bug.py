#!/usr/bin/env python3
"""
DIAGNOSTIC SCRIPT: Session Delete/Reconnect Bug
================================================
Created by: Claude (under Master Architect review)
Date: 2025-12-26

PROBLEM STATEMENT:
- User deleted all sessions via UI
- Sessions still appear in Session Browser
- Cannot reconnect to any session

HYPOTHESIS:
1. DELETE endpoint fails due to FK constraints (browser_commands references session_id)
2. UI local state not refreshed after delete
3. In-memory SessionManager.sessions Map retains zombie references
4. Vibium connection pool exhausted by zombie sessions
"""

# ============================================================================
# PROPOSED FIX PLAN - FOR GEMINI REVIEW
# ============================================================================

PLAN = """
## FIX PLAN: Session Management Bug

### Phase 1: Database Cleanup (Immediate)
1. Add `ON DELETE CASCADE` to `browser_commands.session_id` FK
2. Add `ON DELETE CASCADE` to `browser_screenshots.session_id` FK
3. Verify DELETE endpoint returns proper success/error

### Phase 2: Backend Fix (SessionManager.ts)
1. `deleteSession()` method must:
   - Close WebSocket connection to Vibium
   - Remove from in-memory `sessions` Map
   - Delete from database WITH CASCADE
   - Return success/failure to client

2. Add proper error handling:
   - If DB delete fails, return 500 with reason
   - If session not found, return 404

### Phase 3: Frontend Fix (Playground.tsx)
1. `handleDeleteSession()` must:
   - Call DELETE API
   - On success: Remove from local `savedSessions` state
   - On error: Show error message, DON'T remove from state
   - Refresh session list after delete

### Phase 4: Vibium Connection Management
1. Add connection cleanup on session delete
2. Add timeout for stale Vibium connections
3. Add health check before reconnect

### IMMEDIATE HOTFIX (Do First):
```sql
-- Run in postgres container to fix FK constraints
ALTER TABLE browser_commands 
  DROP CONSTRAINT IF EXISTS browser_commands_session_id_fkey,
  ADD CONSTRAINT browser_commands_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES browser_sessions(id) ON DELETE CASCADE;

ALTER TABLE browser_screenshots
  DROP CONSTRAINT IF EXISTS browser_screenshots_session_id_fkey,
  ADD CONSTRAINT browser_screenshots_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES browser_sessions(id) ON DELETE CASCADE;
```

### NUCLEAR OPTION (If Above Fails):
```sql
-- Wipe all session data and start fresh
TRUNCATE browser_commands, browser_screenshots, browser_sessions CASCADE;
```
"""

# ============================================================================
# CODE CHANGES REQUIRED
# ============================================================================

BACKEND_CHANGES = """
## SessionManager.ts Changes

### Current (Broken):
```typescript
async deleteSession(sessionId: string): Promise<void> {
  // Probably just deletes from DB without:
  // 1. Closing Vibium WebSocket
  // 2. Removing from in-memory Map
  // 3. Handling FK constraint failures
}
```

### Fixed Version:
```typescript
async deleteSession(sessionId: string): Promise<void> {
  // 1. Close Vibium connection first
  const session = this.sessions.get(sessionId);
  if (session) {
    try {
      session.ws.close();
    } catch (e) {
      console.warn(`[SessionManager] Error closing WS for ${sessionId}: ${e}`);
    }
    this.sessions.delete(sessionId);
  }
  
  // 2. Delete from DB (CASCADE handles commands/screenshots)
  const result = await this.db.query(
    'DELETE FROM browser_sessions WHERE id = $1 RETURNING id',
    [sessionId]
  );
  
  if (result.rowCount === 0) {
    throw new Error(`Session ${sessionId} not found`);
  }
  
  console.log(`[SessionManager] Deleted session ${sessionId}`);
}
```
"""

FRONTEND_CHANGES = """
## Playground.tsx Changes

### Current (Broken):
```typescript
const handleDeleteSession = useCallback(async (sessionId: string) => {
  if (!confirm('Delete this session permanently?')) return
  
  const response = await fetch(...)
  // Problem: Doesn't properly handle errors or refresh state
})
```

### Fixed Version:
```typescript
const handleDeleteSession = useCallback(async (sessionId: string) => {
  if (!confirm('Delete this session permanently?')) return
  
  try {
    const response = await fetch(`${SESSION_SERVICE_URL}/sessions/${sessionId}`, {
      method: 'DELETE',
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }
    
    // Only remove from state AFTER successful delete
    setSavedSessions(prev => prev.filter(s => s.id !== sessionId))
    setOutput('Session deleted')
    
  } catch (error) {
    console.error('[Playground] Delete failed:', error)
    setOutput(`Delete failed: ${(error as Error).message}`)
    // Refresh to get actual state from server
    loadSavedSessions()
  }
}, [loadSavedSessions])
```
"""

SCHEMA_CHANGES = """
## PostgreSQL Schema Changes

### File: docker/postgres/init/01_vibium_schema.sql

Add CASCADE to foreign keys:

```sql
-- browser_commands table
CREATE TABLE IF NOT EXISTS browser_commands (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  ...
);

-- browser_screenshots table  
CREATE TABLE IF NOT EXISTS browser_screenshots (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  ...
);
```
"""

# ============================================================================
# VERIFICATION STEPS
# ============================================================================

VERIFICATION = """
## How to Verify Fix Works

1. **Check DB State**:
   ```bash
   docker exec -it docker-postgres-1 psql -U legion -d legion -c "SELECT id, status FROM browser_sessions;"
   ```

2. **Delete a Session**:
   - Click delete in UI
   - Check console for errors
   - Verify session removed from DB

3. **Create New Session**:
   - Should work without errors
   - Should connect to Vibium

4. **Reconnect Test**:
   - Create session, navigate somewhere
   - Close tab
   - Reconnect from Session Browser
   - Should go to saved URL
"""

if __name__ == "__main__":
    print("=" * 60)
    print("SESSION BUG FIX PLAN")
    print("=" * 60)
    print(PLAN)
    print("\n" + "=" * 60)
    print("BACKEND CHANGES")
    print("=" * 60)
    print(BACKEND_CHANGES)
    print("\n" + "=" * 60)
    print("FRONTEND CHANGES")
    print("=" * 60)
    print(FRONTEND_CHANGES)
    print("\n" + "=" * 60)
    print("SCHEMA CHANGES")
    print("=" * 60)
    print(SCHEMA_CHANGES)
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    print(VERIFICATION)

