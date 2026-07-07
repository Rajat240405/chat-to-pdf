// ============================================================
// PromptPress — Realistic Mock Conversation Data
// ============================================================
// These are simulated AI conversations from ChatGPT, Claude,
// and Gemini that demonstrate comprehensive markdown support.
// ============================================================

export interface ProcessingStep {
  id: string;
  label: string;
  status: "completed" | "active" | "pending";
  detail?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface ConversationDocument {
  id: string;
  title: string;
  description: string;
  provider: "chatgpt" | "claude" | "gemini";
  model: string;
  url: string;
  createdAt: string;
  wordCount: number;
  messages: Message[];
  renderedMarkdown: string;
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  created: string;
  model: string;
  wordCount: string;
  provider: string;
  revision: string;
  verified: boolean;
  messageCount: number;
  exportFormats: string[];
}

// ============================================================
// Processing Steps (for processing page)
// ============================================================

export const mockProcessingSteps: ProcessingStep[] = [
  { id: "detect", label: "Detecting Provider", status: "completed", detail: "Provider detected" },
  { id: "auth", label: "Authenticating Link", status: "completed", detail: "Link validated" },
  { id: "parse", label: "Parsing Conversation Blocks", status: "completed", detail: "Conversation parsed" },
  { id: "render", label: "Rendering Markdown", status: "completed", detail: "Success" },
  { id: "optimize", label: "Optimizing PDF Layout", status: "active", detail: "Active" },
];

// ============================================================
// DOCUMENT 1: Distributed Systems Architecture (ChatGPT-4o)
// ============================================================

const doc1Markdown = `# Technical Specification: Distributed Consensus Architecture

This document outlines the implementation strategy for a **leader-less distributed consensus mechanism** designed for high-throughput, low-latency environments. The architecture relies on gossip-based propagation that ensures eventual consistency across globally distributed nodes.

## 1. System Overview

### Problem Statement

Traditional consensus algorithms like Raft or Paxos introduce unacceptable latency bottlenecks in geo-distributed deployments. Our approach eliminates single points of failure while maintaining **strong eventual consistency** guarantees.

\`\`\`typescript
// Core configuration interface
interface ConsensusConfig {
  clusterSize: number;        // Target: 10,000 nodes
  maxLatencyMs: number;       // Target: <200ms
  faultToleranceRatio: number; // Tolerate up to 33% failures
  securityMode: 'mutual-tls' | 'noise' | 'custom';
}
\`\`\`

### Key Design Principles

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Low Latency** | Optimized for edge-node communication | Gossip protocol with epidemic broadcast |
| **Fault Tolerance** | Resilient against node failures | Redundant quorum slices |
| **Scalability** | Horizontal expansion support | Dynamic cluster membership |
| **Security** | Cryptographic verification at every hop | Ed25519 signatures |

> ⚠️ **Critical**: This architecture is specifically designed for *eventual consistency* use cases. If you need strong consistency for financial transactions, consider a modified PBFT variant instead.

## 2. Node Handshake Protocol

Every new node attempting to join the cluster must undergo a cryptographic challenge-response sequence:

\`\`\`go
package consensus

func InitiateHandshake(nodeID string, privateKey ed25519.PrivateKey) (*HandshakeResult, error) {
    // Step 1: Generate cryptographic nonce
    challenge := crypto.GenerateNonce(32)
    
    // Step 2: Sign the challenge
    signature, err := crypto.Sign(challenge, privateKey)
    if err != nil {
        return nil, fmt.Errorf("handshake failed: %w", err)
    }
    
    // Step 3: Broadcast to seed nodes
    response := await Cluster.Broadcast(HandshakeRequest{
        NodeID:    nodeID,
        Challenge: challenge,
        Signature: signature,
        Timestamp: time.Now().UnixNano(),
    })
    
    if !response.Verified {
        return nil, ErrUnauthorizedNode
    }
    
    return &HandshakeResult{
        SessionToken:   response.SessionToken,
        PeersAssigned:  response.Peers,
        ClusterConfig:  response.Config,
    }, nil
}
\`\`\`

### Handshake Flow (Numbered Steps)

1. **Nonce Generation** — A 256-bit cryptographically secure random nonce is generated client-side.
2. **Signature Creation** — The nonce is signed using the node's Ed25519 private key via \`crypto.Sign()\`.
3. **Broadcast Phase** — The signed handshake payload is sent to at least 3 randomly selected seed nodes.
4. **Verification Loop** — Each seed node verifies the signature against the public key registry stored in \`~/.cluster/keys.json\`.
5. **Admission Decision** — If ≥2/3 of contacted seeds approve, the node is admitted to the gossip mesh.
6. **State Sync** — New node receives the current vector clock and begins incremental state synchronization.

## 3. Conflict Resolution Strategy

When divergent states are detected due to network partitions or concurrent writes, the system employs a **vector-clock-based merge strategy**:

### Resolution Priority

The merge algorithm prioritizes conflicts in this order:

- **Causality First**: Events with clear happens-before relationships (\`A → B\`) are ordered deterministically.
- **Lamport Timestamps**: For concurrent events, the node with higher logical clock wins.
- **Application Merge**: As a last resort, custom \`MergeFunction<T>\` handlers resolve domain-specific conflicts.
- **Last-Write-Wins (LWW)**: Fallback for untyped values with nanosecond precision timestamps.

\`\`\`python
# merge.py - Conflict resolution implementation
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar('T')

@dataclass
class StateVector(Generic[T]):
    """CRDT-style state vector for conflict-free replication."""
    version_map: dict[str, int]
    value_store: dict[str, T]

    def merge(self, other: 'StateVector[T]') -> 'StateVector[T]':
        """Merge two state vectors using Last-Writer-Wins semantics."""
        result = StateVector(
            version_map={**self.version_map},
            value_store={**self.value_store},
        )
        
        # Iterate through all keys from both vectors
        for key in set(self.version_map) | set(other.version_map):
            local_ver = self.version_map.get(key, 0)
            remote_ver = other.version_map.get(key, 0)
            
            if local_ver > remote_ver:
                continue  # Keep our value
            elif remote_ver > local_ver:
                result.value_store[key] = other.value_store[key]
                result.version_map[key] = remote_ver
            else:
                # Same version — try custom merge or keep ours
                if hasattr(self.value_store.get(key), '__merge__'):
                    merged = self.value_store[key].__merge__(
                        other.value_store[key]
                    )
                    result.value_store[key] = merged
        
        return result
\`\`\`

## 4. Performance Benchmarks

Performance metrics collected during load testing across three deployment configurations:

| Metric | Cloud-Native (AWS) | Hybrid (On-Prem + Cloud) | Edge-Only (IoT Mesh) |
|--------|-------------------|-------------------------|---------------------|
| Avg. Latency (P50) | **45ms** | 78ms | 120ms |
| Avg. Latency (P99) | 180ms | 290ms | 450ms |
| Throughput | 50,000 ops/sec | 32,000 ops/sec | 18,000 ops/sec |
| Max Supported Nodes | 10,000 | 5,000 | 2,500 |
| Failover Time (RTO) | <1s | <2s | <5s |
| Storage Overhead | 12% | 18% | 25% |
| Network Bandwidth | 240 Mbps/node | 180 Mbps/node | 80 Mbps/node |

## 5. Security Considerations

### Threat Model Analysis

We assume the following adversarial capabilities:

1. **Passive Eavesdroppers**
   - Can observe all plaintext network traffic
   - Cannot compromise TLS sessions
   - Limited to traffic analysis attacks

2. **Active Adversaries (Dolev-Yao Model)**
   - Can drop, delay, reorder, or inject messages
   - Cannot forge valid digital signatures
   - May control ≤33% of network nodes

3. **Compromised Nodes (Byzantine Faults)**
   - Up to f ≤ (n-1)/3 nodes fully compromised
   - Arbitrary behavior including equivocation
   - Mitigated by Byzantine agreement protocols

### Defense-in-Depth Stack

The following layered mitigations address each threat class:

- **Transport Layer**: All inter-node communication encrypted via \`TLS 1.3\` with mutual certificate authentication (mTLS).
- **Message Authentication**: Each message includes an \`HMAC-SHA256\` tag keyed per session.
- **Rate Limiting**: Token-bucket rate limiter prevents flooding attacks (1,000 msgs/sec default).
- **Periodic Re-Keying**: Session keys rotated every 3600 seconds ensuring forward secrecy.
- **Audit Logging**: All consensus votes recorded to immutable write-ahead log (WAL).

\`\`\`bash
# Example: Verifying cluster health and security posture
$ ./consensus-cli health-check --deep-scan --verify-certs

┌─────────────────────────┬──────────┬─────────────┐
│ Check                   │ Status   │ Detail      │
├─────────────────────────┼──────────┼─────────────┤
│ Certificate Validity    │ ✅ PASS  │ Expires: 90d│
│ mTLS Configuration      │ ✅ PASS  │ All peers OK│
│ HMAC Key Rotation       │ ✅ PASS  │ Next: 2h 30m│
│ Rate Limit Compliance   │ ✅ PASS  │ 234 req/s   │
│ Byzantine Quorum Health │ ✅ PASS  │ 67% honest  │
│ WAL Integrity           │ ✅ PASS  │ SHA256 ok   │
└─────────────────────────┴──────────┴─────────────┘

Overall Status: HEALTHY ✓
\`\`\`

## 6. Operational Runbook

### Monitoring Dashboard Integration

Operators should track the following real-time metrics:

#### Critical Alerts (<5 min response SLA)

- **Gossip Fan-out Degradation**: Triggers when average peers-per-round drops below 6.
- **Vector Clock Drift**: Alert if any node exceeds 1,000 unmerged events (>60s age).
- **Handshake Failure Rate Spike**: Should remain below 0.1%; investigate above 1%.

#### Informational Logs

- Membership changes (node join/leave events)
- Leaderless round completion times
- Per-region replica lag measurements

### Troubleshooting Guide

Common operational issues and their recommended resolutions:

**Issue: High Write Latency (>200ms P99)**

1. Check [\`network topology\`](./ops/topology.md) — ensure seed nodes span at least 3 AZs.
2. Verify no single region carries >40% of total traffic.
3. Consider enabling [read-local caching](./docs/caching.md) for hot paths.

**Issue: Split Brain Detection**

1. Confirm ≥51% of seed nodes reachable from each partition.
2. Review [\`partition-tolerance-config\`](./config/partition.yaml) settings.
3. Enable automatic fencing if not already active.

**Issue: Memory Pressure on Vector Clocks**

1. Enable event compaction: Set \`COMPACTION_THRESHOLD=10485760\` (~10MB).
2. Consider snapshot-based state recovery instead of full replay.

---

*Generated from ChatGPT conversation • Rev 2.4.0 • For internal engineering use only*

> 📎 **Source**: [Open Architecture Specification v3.1](https://example.com/spec/v3.1) — Referenced sections 4.2–4.7`;

const distributedSystemsConversation: ConversationDocument = {
  id: "doc-001",
  title: "Technical Specification: Distributed Consensus Architecture",
  description:
    "A comprehensive technical specification for implementing a leader-less distributed consensus protocol using gossip-based propagation.",
  provider: "chatgpt",
  model: "GPT-4o",
  url: "https://chatgpt.com/share/67a1f2c8-e4d9-4b7c-a9e1-2f3d5b6c7e8a",
  createdAt: "2024-10-24T14:32:00Z",
  wordCount: 2847,
  metadata: {
    created: "Oct 24, 2024",
    model: "GPT-4o",
    wordCount: "2,847 words",
    provider: "OpenAI API",
    revision: "2.4.0",
    verified: true,
    messageCount: 18,
    exportFormats: ["PDF", "HTML", "Markdown", "DOCX"],
  },
  messages: [
    {
      role: "user",
      content:
        "Help me design a distributed consensus architecture for a new database system that needs to handle 10K+ nodes with sub-200ms latency across global regions.",
      timestamp: "2024-10-24T14:32:00Z",
    },
    {
      role: "assistant",
      content: doc1Markdown,
    },
  ],
  renderedMarkdown: doc1Markdown,
};

// ============================================================
// DOCUMENT 2: React Performance Optimization (Claude 3.5)
// ============================================================

const doc2Markdown = `# React Component Optimization & Rendering Strategy Guide

This guide covers advanced React rendering optimization patterns for handling **large datasets**, preventing unnecessary re-renders, and building responsive dashboards at scale.

## 1. Understanding React's Rendering Mental Model

Before optimizing, it is critical to understand *when* and *why* React triggers re-renders:

The rendering flow works like this:

1. A \`setState\` or props change triggers a dirty check on the component tree.
2. If updates are detected, React schedules a re-render cycle.
3. For memoized components (\`React.memo\`), shallow comparison determines if re-render can be skipped.
4. Changes are committed to the DOM during the commit phase.

### The Three Cardinal Rules of React Performance

1. **Render only what needs updating** — Use component isolation.
2. **Pass stable references** — \`useMemo\`, \`useCallback\`, and memoized selectors prevent cascading re-renders.
3. **Measure before optimizing** — Profile with \`React DevTools Profiler\`.

> 💡 **Pro Tip**: >60% of performance issues I see in production codebases stem from unstable prop references, not expensive computation itself.

## 2. Common Anti-Patterns & Fixes

### Pattern A: Inline Function Creation in JSX

This is the #1 cause of unnecessary child re-renders:

\`\`\`jsx
// ❌ ANTI-PATTERN: Creates new function every render
function TodoList({ items, onUpdate }) {
  return (
    <ul>
      {items.map(item => (
        // onUpdate gets a NEW function reference each render!
        <TodoItem 
          key={item.id}
          item={item}
          onUpdate={(val) => onUpdate(item.id, val)}  
        />
      ))}
    </ul>
  );
}
\`\`\`

\`\`\`tsx
// ✅ OPTIMIZED: Stable callback via useCallback + data attribute
import { useCallback } from 'react';

function TodoList({ items, onUpdate }) {
  const handleUpdate = useCallback((e) => {
    const id = e.currentTarget.dataset.id;
    const value = e.currentTarget.dataset.value;
    onUpdate(id, value);
  }, [onUpdate]);

  return (
    <ul>
      {items.map(item => (
        <TodoItem
          key={item.id}
          item={item}
          onUpdate={handleUpdate}
          data-id={item.id}
        />
      ))}
    </ul>
  );
}
\`\`\`

### Pattern B: Expensive Computations in Render Body

When transforming/filtering large arrays, always wrap in \`useMemo\`:

\`\`\`typescript
// utils/useFilteredData.ts
import { useMemo } from 'react';

interface FilterOptions {
  searchQuery: string;
  category: string | null;
  sortBy: 'name' | 'date' | 'priority';
  sortOrder: 'asc' | 'desc';
  statusFilter: ('active' | 'archived')[];
}

export function useFilteredData<T extends Record<string, any>>(
  rawData: T[],
  options: FilterOptions
): T[] {
  const filtered = useMemo(() => {
    let result = [...rawData];

    // 1. Search filter
    if (options.searchQuery.trim()) {
      const query = options.searchQuery.toLowerCase();
      result = result.filter(item =>
        Object.values(item).some(val =>
          String(val).toLowerCase().includes(query)
        )
      );
    }

    // 2. Category filter
    if (options.category) {
      result = result.filter(item => item.category === options.category);
    }

    // 3. Status filter (multi-select)
    if (options.statusFilter.length > 0) {
      result = result.filter(item =>
        options.statusFilter.includes(item.status)
      );
    }

    // 4. Sort
    result.sort((a, b) => {
      const aVal = a[options.sortBy];
      const bVal = b[options.sortBy];
      const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return options.sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [rawData, options]);

  return filtered;
}
\`\`\`

## 3. Virtualization for Large Lists

For lists exceeding ~100 visible items, implement windowed virtualization:

\`\`\`bash
# Install virtualization library
npm install @tanstack/react-virtual
\`\`\`

\`\`\`tsx
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface RowData {
  id: string;
  name: string;
  status: string;
}

function VirtualizedTable({ rows }: { rows: RowData[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44, // Row height estimate in px
    overscan: 10,         // Pre-render extra rows for smooth scrolling
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="h-[600px] overflow-auto relative border rounded"
    >
      {/* Total height container */}
      <div style={{ height: rowVirtualizer.getTotalSize() }}>
        {virtualItems.map(virtualItem => {
          const row = rows[virtualItem.index];
          return (
            <div
              key={row.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualItem.size,
                transform: \`translateY(\${virtualItem.start}px)\`,
              }}
              className="flex items-center border-b px-4 hover:bg-gray-50"
            >
              <span className="w-48 font-mono text-sm text-gray-600">{row.id}</span>
              <span className="flex-1 text-sm text-gray-900">{row.name}</span>
              <span className="w-24 text-right text-sm">
                <span className={
                  row.status === 'active' ? 'text-green-600' :
                  row.status === 'archived' ? 'text-gray-400' :
                  'text-orange-500'
                }>
                  {row.status}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
\`\`\`

### Virtualization Performance Comparison

| Approach | Items | Initial Load Time | Scroll FPS | Memory Footprint |
|----------|-------|-------------------|------------|------------------|
| Native DOM rendering | 1,000 | 1,200ms | 15-20 fps | ~85 MB |
| react-window v1 | 1,000 | 45ms | 60 fps | ~12 MB |
| @tanstack/react-virtual | 1,000 | 38ms | 60 fps | ~11 MB |

As shown above, virtualization provides **25-30x improvement** in initial render time while reducing memory usage by ~87%.

## 4. State Management Architecture

For complex dashboards, avoid prop drilling and adopt a structured state pattern using Zustand:

### Recommended Architecture Layers

\`\`\`
┌──────────────────────────────────────────────────────────┐
│                      UI Layer                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐  │
│  │ Header     │  │ Sidebar    │  │ Main Content Area  │  │
│  └─────┬──────┘  └─────┬──────┘  └────────┬───────────┘  │
│        └────────────────┼─────────────────┘               │
│                         ▼                                 │
│  ┌────────────────────────────────────────────────────┐   │
│  │              Feature Hooks Layer                     │   │
│  │  useTodoList()  •  useFilters()  •  useSort()      │   │
│  └─────────────────────────┬──────────────────────────┘   │
│                            ▼                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │           Zustand Store (Atomic State)              │   │
│  │  items • filters • UI preferences • cache keys     │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
\`\`\`

### Zustand Store Definition

\`\`\`typescript
// stores/dashboard.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface DashboardState {
  // Data state
  items: DashboardItem[];
  isLoading: boolean;
  error: string | null;

  // Filter state
  searchQuery: string;
  selectedCategories: Set<string>;
  dateRange: { start: Date; end: Date } | null;
  currentPage: number;

  // Actions
  setSearchQuery: (q: string) => void;
  toggleCategory: (category: string) => void;
  setDateRange: (range: { start: Date; end: Date }) => void;
  setPage: (page: number) => void;
  fetchItems: () => Promise<void>;
  clearFilters: () => void;
}

interface DashboardItem {
  id: string;
  title: string;
  category: string;
  status: 'active' | 'archived' | 'draft';
  createdAt: Date;
  priority: 'low' | 'medium' | 'high';
}

export const useDashboardStore = create<DashboardState>()(
  devtools(
    persist(
      (set, get) => ({
        // === Initial State ===
        items: [],
        isLoading: false,
        error: null,
        searchQuery: '',
        selectedCategories: new Set(),
        dateRange: null,
        currentPage: 1,

        // === Actions ===
        setSearchQuery: (q) => set({ searchQuery: q }, false, 'setSearchQuery'),

        toggleCategory: (cat) => set((state) => {
          const next = new Set(state.selectedCategories);
          next.has(cat) ? next.delete(cat) : next.add(cat);
          return { selectedCategories: next };
        }, false, 'toggleCategory'),

        setDateRange: (range) => set({ dateRange: range }, false, 'setDateRange'),

        setPage: (page) => set({ currentPage: page }, false, 'setPage'),

        clearFilters: () => set({
          searchQuery: '',
          selectedCategories: new Set(),
          dateRange: null,
          currentPage: 1,
        }, false, 'clearFilters'),

        fetchItems: async () => {
          set({ isLoading: true, error: null });
          try {
            const { searchQuery, selectedCategories, dateRange } = get();
            
            const params = new URLSearchParams({
              q: searchQuery,
              cats: [...selectedCategories].join(','),
              page: String(get().currentPage),
              ...(dateRange && {
                from: dateRange.start.toISOString(),
                to: dateRange.end.toISOString(),
              }),
            });

            const res = await fetch(\`/api/dashboard?\${params}\`);
            
            if (!res.ok) throw new Error('Failed to fetch dashboard data');
            
            const items: DashboardItem[] = await res.json();
            set({ items, isLoading: false });
          } catch (err) {
            set({ error: (err as Error).message, isLoading: false });
          }
        },
      }),
      {
        name: 'dashboard-storage',  // localStorage key
        partialize: (state) => ({ 
          searchQuery: state.searchQuery, 
          selectedCategories: [...state.selectedCategories],
        }),  // Only persist filters, not data
      }
    ),
    { name: 'DashboardStore' }
  )
);
\`\`\`

## 5. Profiling Checklist & Validation

Run through this checklist before shipping performance-sensitive features:

### Pre-Launch Validation Checklist

- [ ] No inline functions defined directly within JSX render body
- [ ] All array mapping operations include stable \`key\` props
- [ ] Large lists (>100 visible items) use virtualization (\\\`@tanstack/react-virtual\\\`)
- [ ] Expensive computations wrapped with \`useMemo\` with correct dependency arrays
- [ ] Callback props passed to children stabilized with \`useCallback\`
- [ ] Heavy leaf components wrapped in \`React.memo()\` where appropriate
- [ ] Bundle size analyzed with \`webpack-bundle-analyzer\` or similar tool
- [ ] Lighthouse performance score >90 on target devices (mobile + desktop)
- [ ] No excessive re-renders detected in React DevTools Profiler
- [ ] Memory consumption stable over extended usage (no leaks)

---

*Extracted from Claude conversation • Architecture recommendations validated against React 18+ internals*

> 🔗 **Related Reading**: [React Docs - Optimizing Performance](https://react.dev/reference/react/memo) | [Zustand Documentation](https://zustand-demo.pmnd.rs/)`;

const reactOptimizationConversation: ConversationDocument = {
  id: "doc-002",
  title: "React Component Optimization & Rendering Strategy Guide",
  description:
    "Deep dive into React rendering patterns, memoization strategies, and performance profiling techniques.",
  provider: "claude",
  model: "Claude 3.5 Sonnet",
  url: "https://claude.ai/share/89b3e2f1-a6c7-4d3e-b8f2-1a4c5d6e7f8a",
  createdAt: "2024-11-02T09:15:00Z",
  wordCount: 3214,
  metadata: {
    created: "Nov 02, 2024",
    model: "Claude 3.5 Sonnet",
    wordCount: "3,214 words",
    provider: "Anthropic API",
    revision: "1.3.2",
    verified: true,
    messageCount: 24,
    exportFormats: ["PDF", "HTML", "Markdown", "DOCX"],
  },
  messages: [
    {
      role: "user",
      content:
        "Our React dashboard has performance issues when rendering large datasets with 1000+ items. Can you analyze common re-render patterns and provide optimization strategies?",
      timestamp: "2024-11-02T09:15:00Z",
    },
    {
      role: "assistant",
      content: doc2Markdown,
    },
  ],
  renderedMarkdown: doc2Markdown,
};

// ============================================================
// DOCUMENT 3: Database Migration Playbook (Gemini Pro)
// ============================================================

const doc3Markdown = `# PostgreSQL Migration Playbook: Monolith to Microservices

This playbook provides a phased, zero-downtime approach to decomposing your 127-table PostgreSQL database into **bounded context microservices** while preserving foreign key integrity throughout the transition.

## 1. Discovery & Domain Modeling

### Step 1: Aggregate Root Identification

First, map your tables to DDD aggregate roots using this analysis framework. Run the following SQL against your production database (on a read replica!):

\`\`\`sql
-- Analyze table dependencies to identify aggregate boundaries
WITH RECURSIVE dependency_tree AS (
  -- Base case: all tables with FK constraints
  SELECT
    tc.table_name AS referencing_table,
    ccu.table_name AS referenced_table,
    kcu.column_name AS fk_column,
    rc.delete_rule,
    1 AS depth
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.unique_constraint_name
    OR ccu.constraint_name = (
      SELECT cu.constraint_name
      FROM information_schema.key_column_usage cu
      WHERE cu.column_name = ccu.column_name
        AND cu.table_name = tc.table_name
        LIMIT 1
    )
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
)
SELECT
  dt.referencing_table AS "Table Name",
  COUNT(*) AS "FK Count",
  ARRAY_AGG(DISTINCT dt.referenced_table ORDER BY dt.referenced_table) AS "Depends On",
  CASE 
    WHEN COUNT(*) >= 5 THEN '⚠️ HIGH COHESION'
    WHEN COUNT(*) >= 3 THEN '⚡ MODERATE'
    ELSE '✅ LOW COHESION'
  END AS "Cohesion Level"
FROM dependency_tree dt
GROUP BY dt.referencing_table
ORDER BY "FK Count" DESC
LIMIT 30;
\`\`\`

### Sample Output Interpretation

| Table Name | FK Count | Depends On | Cohesion | Recommended Service |
|------------|----------|------------|----------|--------------------|
| \`order_items\` | 5 | orders, products, pricing, ... | ⚠️ High | Order Service |
| \`users\` | 3 | organizations, roles, auth | ✅ Low | Identity Service |
| \`audit_logs\` | 1 | users | ✅ Low | Audit Service |
| \`payments\` | 4 | orders, customers, gateways, ... | ⚠️ High | Payment Service |
| \`product_categories\` | 2 | products, catalogs | ✅ Low | Catalog Service |
| \`subscription_plans\` | 6 | users, features, billing, ... | ⚠️ High | Billing Service |

Based on dependency density analysis, we identify these **bounded contexts**:

1. **Identity Context**
   - Tables: \`users\`, \`organizations\`, \`roles\`, \`permissions\`, \`auth_tokens\`
   - Pattern: Central authority service, referenced by almost everything else
   
2. **Catalog Context**
   - Tables: \`products\`, \`categories\`, \`inventory\`, \`suppliers\`, \`pricing_tiers\`
   - Pattern: Relatively independent, high read-to-write ratio

3. **Order Context**
   - Tables: \`orders\`, \`order_items\`, \`shipments\`, \`returns\`, \`order_status_log\`
   - Pattern: Transactional core, high cohesion (keep together!)

4. **Payment Context**
   - Tables: \`payments\`, \`refunds\`, \`transactions\`, \`subscriptions\`, \`invoices\`
   - Pattern: Financial domain with strict audit requirements

> 📌 **Decision Point**: Tables marked with "High Cohesion" should **stay within a single service initially**. Do not force-split aggregates just to satisfy Conway's Law — that leads to distributed monoliths which are worse than actual monoliths.

## 2. Strangler Fig Pattern Implementation

We will use the classic **Strangler Fig Pattern** to incrementally extract services without requiring a big-bang cutover or any downtime window:

\`\`\`
Phase 0: Preparation (Weeks 1-2)
├── 📋 Set up CDC pipeline (Debezium → Kafka / PG Logical Replication)
├── 🔗 Deploy API gateway / service mesh (Istio, Kong, or Traefik)
├── 📊 Establish monitoring baseline (metrics, tracing, alerting)
└── 🧪 Create staging environment mirroring production schema

Phase 1: Read Extraction (Weeks 3-6)
├── 🔄 Deploy read replicas for targeted bounded contexts
├── 🔀 Route read-only queries to new services via feature flags
├── ✓ Validate data consistency between legacy and new sources
├── 🚦 Gradually shift traffic using canary deployments
└── 📈 Monitor latency, error rates, and data drift continuously

Phase 2: Write Extraction (Weeks 7-12)
├── 📤 Implement dual-write pattern with transactional outbox
├── ✏️ Migrate write operations one bounded context at a time
├── ❌ Remove original FK constraints (replace with app-level validation)
├── 🗑️ Decommission migrated tables from monolith (DROP not DELETE!)
└── ♻️ Reclaim disk space with VACUUM FULL

Phase 3: Hardening & Cleanup (Weeks 13-16)
├── 🛡️ Add circuit breakers between inter-service calls
🖥️ Implement saga choreography/orchestration for cross-service TX
├── 💥 Run chaos engineering tests (simulated partition, node failure)
├── 📝 Finalize runbooks, incident procedures, SLO definitions
└── 🎉 Celebrate with the team!
\`\`\`

## 3. Dual-Write Safety with Transactional Outbox

The most critical risk in this migration is maintaining **data consistency during the dual-write phase**. Here is the proven transactional outbox pattern:

\`\`\`java
// OrderService.java — Transactional outbox implementation
package com.company.orders.service;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxRepository;
    private final EventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    private static final int MAX_RETRIES = 5;
    private static final Duration RETRY_BACKOFF = Duration.ofSeconds(5);

    /**
     * Creates a new order and atomically persists the domain event
     * in the same database transaction.
     */
    @Transactional(propagation = Propagation.REQUIRED, isolation = Isolation.READ_COMMITTED)
    public OrderDTO createOrder(CreateOrderRequest request) throws OrderCreationException {
        try {
            // ===== Phase 1: Business Logic =====
            var order = buildOrderFromRequest(request);
            
            // Apply business validations
            validateInventory(request.getItems());
            applyPricingRules(order);
            
            order = orderRepository.save(order);
            log.info("Order created: {}", order.getId());

            // ===== Phase 2: Outbox Event Creation (same TX!) =====
            var eventPayload = OrderCreatedEvent.builder()
                .orderId(order.getId())
                .userId(order.getUserId())
                .totalAmount(order.getTotalAmount())
                .currency("USD")
                .lineItemCount(order.getItems().size())
                .createdAt(Instant.now())
                .build();

            var outboxEvent = OutboxEvent.builder()
                .aggregateType(Order.class.getSimpleName())
                .aggregateId(order.getId().toString())
                .eventType("OrderCreated")
                .payload(objectMapper.writeValueAsString(eventPayload))
                .correlationId(MDC.get("trace-id"))
                .createdAt(Instant.now())
                .status(OutboxStatus.PENDING)
                .retryCount(0)
                .build();

            outboxRepository.save(outboxEvent);
            
            // Transaction commits here — BOTH writes are atomic!
            return OrderDTOMapper.toDTO(order);

        } catch (JsonProcessingException e) {
            throw new OrderCreationException("Serialization failed", e);
        } catch (DataIntegrityViolationException e) {
            throw new OrderCreationException("Constraint violation", e);
        }
    }

    /**
     * Polls pending outbox events and publishes them to the event bus.
     * Idempotent — safe to run multiple instances concurrently.
     */
    @Scheduled(fixedDelayString = "\${outbox.poll-interval-ms:5000}")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void publishPendingEvents() {
        List<OutboxEvent> pending = outboxRepository.findPendingOrderedByCreatedAt(
            PageRequest.of(0, 100));
        
        if (pending.isEmpty()) {
            return;
        }

        log.debug("Processing {} pending outbox events", pending.size());
        
        for (OutboxEvent event : pending) {
            publishSingleEvent(event);
        }
    }

    private void publishSingleEvent(OutboxEvent event) {
        try {
            eventPublisher.publish(event.getEventType(), event.getPayload());
            
            // Mark as published (idempotent update)
            event.markPublished();
            outboxRepository.save(event);
            
        } catch (PublishFailureException e) {
            handlePublishFailure(event, e);
        } catch (Exception e) {
            log.error("Unexpected error publishing event {}: {}", event.getId(), e.getMessage(), e);
            handlePublishFailure(event, e);
        }
    }

    private void handlePublishFailure(OutboxEvent event, Exception e) {
        event.incrementRetryCount();
        
        if (event.getRetryCount() > MAX_RETRIES) {
            event.fail(e.getClass().getSimpleName() + ": " + e.getMessage());
            outboxRepository.save(event);
            alertOnMaxRetriesExceeded(event);
        } else {
            event.setNextAttemptAt(Instant.now().plus(RETRY_BACKOFF.multipliedBy(event.getRetryCount())));
            outboxRepository.save(event);
        }
    }
}
\`\`\`

### Event Schema Contract (All services must conform)

Each outbox event follows this standardized envelope format. **Breaking changes require version bumps.**

\`\`\`json
{
  "$schema": "https://company.com/schemas/outbox-event/v1.json",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "traceId": "abc123-trace-correlation-id",
  "timestamp": "2024-11-10T16:47:22.123Z",
  "source": "order-service",
  "type": "OrderCreated",
  "data": {
    "orderId": "ord_8f3k2j1x",
    "userId": "usr_m9n4p2q7",
    "totalAmount": 149.99,
    "currency": "USD",
    "lineItemCount": 3
  },
  "metadata": {
    "schemaVersion": "1.2.0",
    "causationId": null,
    "correlationId": "req_xyz789"
  }
}
\`\`\`

## 4. Foreign Key Replacement Strategy

After extracting a table to its own service, the original FK constraint in PostgreSQL becomes invalid (it would point to a different database!). Replace with **application-level referential integrity**:

\`\`\`sql
-- ============================================
-- BEFORE: Traditional FK constraint (monolith era)
-- ============================================
ALTER TABLE order_items
ADD CONSTRAINT fk_order_items_orders
FOREIGN KEY (order_id)
REFERENCES orders(id)
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Index for performance (already exists hopefully)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- ============================================
-- AFTER: Application-level constraint (post-extraction)
-- ============================================
-- Step 1: Remove the physical FK constraint
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS fk_order_items_orders;

-- Step 2: Add documentation comment
COMMENT ON COLUMN order_items.order_id IS 
'References orders.id in Order Service (migrated 2024-11). '
'Validation happens via GET /api/orders/{id}/validate endpoint call. '
'DO NOT add back FK constraint — crosses service boundary!';

-- Step 3: Keep index for query performance (still needed!)
-- Already exists: idx_order_items_order_id
\`\`\`

The receiving service validates ownership via a lightweight RPC/gRPC call:

**Request:** \`GET /api/orders/{order_id}/validate-existence?tenant={tenant_id}\`

**Response:**
\`\`\`
{
  "exists": true,
  "belongsToTenant": true,
  "statusCode": "ACTIVE",
  "lastModified": "2024-11-10T16:45:00Z"
}
\`\`\`

## 5. Rollback Procedure

If issues arise at any migration phase, execute this rollback plan immediately:

| Trigger Condition | Severity | Action | RTO Target |
|-------------------|----------|--------|------------|
| Data drift ≥ 0.01% | 🔴 Critical | Pause migration, initiate reconciliation job | <5 min |
| P95 latency > 500ms | 🟠 High | Route traffic back to monolith via DNS toggle | <2 min |
| Error rate > 0.5% | 🔴 Critical | Emergency failover; circuit breaker opens | <30 sec |
| Service unhealthy | 🔴 Critical | Immediate failover to legacy path | Instantaneous |
| CDC lag > 60 sec | 🟡 Medium | Throttle incoming traffic, investigate consumer health | <10 min |

### Emergency Rollback Script

\`\`\`bash
#!/bin/bash
# ================================================
# rollback-emergency.sh
# EXECUTE ONLY AFTER CONFIRMING WITH SRE LEAD
# Expected RTO: <60 seconds end-to-end
# ================================================

set -euo pipefail

echo "[ROLLBACK] Starting emergency rollback procedure..."
echo "[ROLLBACK] $(date '+%Y-%m-%d %H:%M:%S UTC')"

# ====== STEP 1: Halt new migrations ======
echo "[STEP 1/5] Pausing deployment rollouts..."
kubectl rollout pause deploy/order-service -n production || true
kubectl rollout pause deploy/payment-service -n production || true

# ====== STEP 2: Switch DNS/routing ======
echo "[STEP 2/5] Routing traffic back to monolith..."

# Option A: If using Istio VirtualService
kubectl patch vs api-gateway-production -n istio-system --type='json' \
  -p='[{"op": "replace", "path": "/spec/http/0/route/0/destination/host", "value": "monolith-db-proxy.production.svc.cluster.local"}]' \
  || echo "Istio patch failed, trying fallback..."

# Option B: Fallback to Ingress annotation update
kubectl patch ingress api-backend-rules \
  -p '{"spec":{"rules":[{"host":"api.internal.company.com","http":{"paths":[{"path":"/orders","pathType":"Prefix","backend":{"service":{"name":"monolith-db-proxy","port":{"number":8080}}}}]}]}}}' \
  || echo "Using ingress-based routing"

echo "[STEP 2/5] Traffic routed to monolith ✓"

# ====== STEP 3: Verify connectivity ======
echo "[STEP 3/5] Verifying monolith connectivity..."
MAX_ATTEMPTS=10
ATTEMPT=0

until pg_isready -h monolith-primary.database.svc.cluster.local -p 5432 -q; do
    ATTEMPT=\$((ATTEMPT + 1))
    if [ \$ATTEMPT -ge \$MAX_ATTEMPTS ]; then
        echo "[ERROR] Monolith unreachable after MAX_ATTEMPTS attempts!"
        exit 1
    fi
    echo "[STEP 3/5] Waiting..."
    sleep 3
done
echo "[STEP 3/5] Monolith accepting connections ✓"

# ====== STEP 4: Notify team ======
echo "[STEP 4/5] Sending alerts..."
curl -s -X POST "$SLACK_WEBHOOK_URL" \\
  -H 'Content-type: application/json' \\
  -d '{"text":"🚨 <!channel> **Emergency Rollback Executed**\\n\\n• Route: monolith-restored-as-primary\\n• Time: '$(date -u)'\\n• Reason: See PagerDuty incident\\n• Status: Verify manually"}'

# Trigger PagerDuty incident escalation
curl -s -X POST "$PAGERDUTY_API_URL/incidents" \\
  -H "Authorization: Token token=$PAGERDUTY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"incident":{"type":"incident","title":"Emergency DB Migration Rollback","service":{"id":"'$PAGERDUTY_SERVICE_ID'"},"urgency":"high","body":{"type":"incident_body","details":"Automated rollback triggered per playbook Section 5"}}}'

echo "[STEP 4/5] Alerts sent ✓"

# ====== STEP 5: Summary ======
echo ""
echo "============================================="
echo "[ROLLBACK] Complete at $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo "[ROLLBACK] Monolith restored as primary data source"
echo "[ROLLBACK] Investigate root cause before re-attempting"
echo "============================================="
\`\`\`

---

*Generated by Gemini Pro • Database migration best practices based on industry patterns from Stripe, Shopify, and GitHub*

> 📋 **Pre-flight Checklist**: Before starting Phase 1 of this playbook, ensure ALL preconditions in Section 1 are met, validated by both DBA sign-off and security review.`;

const dbMigrationConversation: ConversationDocument = {
  id: "doc-003",
  title: "PostgreSQL Migration Playbook: From Monolith to Microservices",
  description:
    "A step-by-step migration playbook for decomposing a monolithic PostgreSQL database into bounded context services.",
  provider: "gemini",
  model: "Gemini Pro",
  url: "https://gemini.google.com/share/abcd1234-ef56-7890-abcd-ef1234567890",
  createdAt: "2024-11-10T16:45:00Z",
  wordCount: 2598,
  metadata: {
    created: "Nov 10, 2024",
    model: "Gemini Pro",
    wordCount: "2,598 words",
    provider: "Google DeepMind",
    revision: "1.0.0",
    verified: true,
    messageCount: 15,
    exportFormats: ["PDF", "HTML", "Markdown", "DOCX"],
  },
  messages: [
    {
      role: "user",
      content:
        "We need to migrate our PostgreSQL monolith database into microservices. We have 127 tables, heavy FK constraints, and can't afford downtime. What's the safest approach?",
      timestamp: "2024-11-10T16:45:00Z",
    },
    {
      role: "assistant",
      content: doc3Markdown,
    },
  ],
  renderedMarkdown: doc3Markdown,
};

// ============================================================
// Export All Documents
// ============================================================

export const mockDocuments: ConversationDocument[] = [
  distributedSystemsConversation,
  reactOptimizationConversation,
  dbMigrationConversation,
];

// Default active document (first one)
export const mockActiveDocument: ConversationDocument = mockDocuments[0];

// Backward compatibility exports
export const mockDocumentMetadata = mockActiveDocument.metadata;
export const mockMarkdownContent = mockActiveDocument.renderedMarkdown;

export const mockGalleryDocuments = [
  {
    id: "1",
    title: "API Integration Guide",
    subtitle: "CONVERTED FROM CLAUDE-3.5",
    preview: "api",
  },
  {
    id: "2",
    title: "React Logic Refactor",
    subtitle: "CONVERTED FROM CHATGPT-4O",
    preview: "code",
  },
  {
    id: "3",
    title: "Architecture Overview",
    subtitle: "CONVERTED FROM GEMINI PRO",
    preview: "diagram",
  },
];

export const mockRecentDocuments = [
  { id: "d1", title: "Distributed Consensus Architecture", date: "2h ago", docId: "doc-001" },
  { id: "d2", title: "React Optimization Guide", date: "5h ago", docId: "doc-002" },
  { id: "d3", title: "Database Migration Playbook", date: "1d ago", docId: "doc-003" },
  { id: "d4", title: "API Design Patterns", date: "2d ago", docId: "doc-001" },
];
