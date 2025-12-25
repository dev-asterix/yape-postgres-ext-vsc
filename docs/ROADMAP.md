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

### 2B: Notebook Experience ✅ MOSTLY COMPLETE
- [x] Sticky headers (already implemented)
- [x] Query cancellation backend infrastructure
- [x] Column resizing  
- [ ] Virtual scrolling (deferred - 6-8 hrs)
- [ ] Cancel button UI (deferred - requires major refactor)

### 2C: AI Assistant
- [ ] Schema context caching
- [ ] Query history in AI context
- [ ] "Explain this error" feature
- [ ] Query optimization suggestions

---

## 🏗️ Phase 3: Architecture Refactoring

### Code Organization
- [ ] Split `extension.ts` (882 lines) → `commands.ts`, `providers.ts`, `views.ts`
- [ ] Split `tables.ts` (51KB) → `operations.ts`, `scripts.ts`, `maintenance.ts`
- [ ] Split `renderer_v2.ts` (144KB) into modules

### Service Layer
- [ ] Command factory pattern for CRUD operations
- [ ] Query history service
- [ ] Connection pooling

---

## 📚 Phase 4: Documentation

- [ ] `ARCHITECTURE.md` with system diagrams
- [ ] `CONTRIBUTING.md` with code style guide
- [ ] Troubleshooting section in README
- [ ] Feature comparison vs pgAdmin/DBeaver

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
