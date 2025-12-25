# PgStudio Improvement Roadmap

> Last Updated: December 2025

---

## ✅ Phase 1: Connection Management UX (COMPLETE)

- [x] SSL mode dropdown (disable, allow, prefer, require, verify-ca, verify-full)
- [x] SSL certificate paths (CA, client cert, client key)
- [x] Connection timeout setting
- [x] Statement timeout setting
- [x] Application name (shown in `pg_stat_activity`)
- [x] Raw options field (`-c search_path=myschema`)

---

## 🎯 Phase 2: UX Enhancements

### 2A: Tree View Improvements ✅ COMPLETE
- [x] Quick filter input for searching objects (toggle icon, schema filtering)
- [x] Favorites (star frequently-used tables/views)  
- [x] ⭐ Favorites section under connection
- [x] Context menu preserved for favorited items
- [x] 🕒 Recent items tracking (max 10 items)
- [x] Object count badges on category nodes (right-aligned, muted)

### 2B: Notebook Experience ✅ COMPLETE
- [x] Sticky headers (already implemented)
- [x] Query cancellation backend infrastructure
- [x] Column resizing  
- [x] Infinite scrolling (200 rows/chunk with IntersectionObserver)
- [x] Result truncation (10k row limit to prevent crashes)
- [ ] Cancel button UI (deferred - requires major refactor)

### 2C: AI Assistant ✅ MOSTLY COMPLETE
- [x] Schema context caching
- [x] Query history in AI context
- [x] "Explain this error" feature
- [x] Data Analysis (with file attachment)
- [ ] Query optimization suggestions

---

## 🏗️ Phase 3: Architecture Refactoring ✅ MOSTLY COMPLETE

### Code Organization
- [x] Split `extension.ts` → `commands/`, `providers/`, `services/`
- [x] Split `renderer_v2.ts` into modular components (`renderer/components/`, `renderer/features/`)
- [ ] Split `tables.ts` (51KB) → `operations.ts`, `scripts.ts`, `maintenance.ts`

### Service Layer ✅ COMPLETE
- [x] Hybrid connection pooling (`pg.Pool` for ephemeral, `pg.Client` for sessions)
- [x] Command pattern for CRUD operations
- [x] Query history service
- [x] Centralized error handling (`ErrorService`)
- [x] Strict typing (removed `any` from core services)
- [x] Legacy code removal (`getConnection` deprecated)

### Performance Optimizations ✅ COMPLETE
- [x] Backend result truncation (10k row limit)
- [x] Frontend infinite scrolling (200 rows/chunk)
- [x] Connection leak prevention (try/finally patterns)

---

## 📚 Phase 4: Documentation ✅ COMPLETE

- [x] `ARCHITECTURE.md` with system diagrams
- [x] `CONTRIBUTING.md` with code style guide
- [x] Troubleshooting section in README
- [x] Feature comparison vs pgAdmin/DBeaver/TablePlus

---

## 🚀 Phase 5: Future Features

### Near-term (1-3 months)
- [ ] Query snippets with variables
- [ ] Table structure diff across connections
- [ ] Smart query bookmarks

### Mid-term (3-6 months)
- [ ] Connection export/import (encrypted)
- [ ] Shared query library (`.pgstudio/` folder)
- [ ] ERD diagram generation

### Long-term (6+ months)
- [ ] Audit logging
- [ ] Schema migration tracking
- [ ] Role-based access controls

---

## 🔧 Technical Debt

| Item | Priority |
|------|----------|
| Migrate inline styles to `htmlStyles.ts` | Medium |
| Standardize error handling | Medium |
| Add JSDoc to exported functions | Low |
