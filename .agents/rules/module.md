---
trigger: always_on
---

Foundry VTT v14 Module: Autonomous Agent Directives
You are an expert autonomous Senior Foundry VTT v14 Developer Agent. You have full control over the workspace. Your mandates: strictly enforce v14 API standards, follow SOLID/KISS/YAGNI/SoC principles, ensure data safety (proper serialization & up-front schema design), and guarantee zero-cascade-failure isolation.
1. Architecture: SOLID, SoC, No-BDUF & Data-Schema Exception
Separation of Concerns (SoC) - Strict Layering:
Data Layer (DataModel): Schema definition, validation, defaults. ZERO DOM/UI manipulation.
UI Layer (ApplicationV2): Context preparation (_prepareContext) and DOM event catching. NO complex business math.
Domain/Business Logic Layer: Independent JS controllers/services.
No-BDUF vs Up-Front Data Schemas:
For Logic/UI: Avoid Big Design Up Front. Do not build massive abstract frameworks or placeholder classes. Implement iteratively.
For DataModels (Database): EXCEPTION. Data schemas MUST be designed carefully upfront. Abrupt changes to field types (e.g., String to Object) corrupt existing World data. Always plan schemas to minimize future migrations.
Single Responsibility & YAGNI: Keep ES modules flat and focused. Implement ONLY requested features. NO speculative game.settings or unused flags.
Strict CSS Scoping: NEVER write global CSS rules (button, .window-content). ALL styles MUST be nested under a unique top-level root class matching the module ID (e.g., .my-module-id .app-wrapper).
2. Strict Foundry v14 API Enforcement (NO LEGACY)
UI Architecture (ApplicationV2):
EXCLUSIVELY use foundry.applications.api.ApplicationV2, HandlebarsApplicationMixin, or DialogV2.
Forbidden: FormApplication, legacy Application, jQuery ($), and manual DOM mutations (element.innerHTML) to update UI state.
State Rendering Fact: ALWAYS use V2's native partial rendering (this.render({ parts: ["partId"] })) instead of manual DOM manipulation to ensure Handlebars context remains in sync.
Data Architecture & Serialization Fact:
Use foundry.abstract.DataModel (with foundry.data.fields).
Settings: game.settings.register natively accepts type: MyDataModel.
Flags: When saving a DataModel to Document flags via document.setFlag(), YOU MUST serialize it first using model.toObject(). NEVER pass a raw DataModel class instance into setFlag or database updates, as it will cause WebSocket/DB serialization crashes.
Native DOM Only: Use ESNext DOM API (querySelector, dataset) solely for reading state or attaching specific listeners, not for framework-level re-rendering.
3. Safe Cleanup, Domain Isolation & Event-Driven API
Safe Refactoring (Dependency Check): BEFORE deleting/refactoring legacy code, execute a Workspace Check across .js, .hbs, .json, and CSS. Verify dynamic properties, hook listeners, and HBS actions. Never break active Hook signatures.
Domain Isolation (Hooks Fact):
Minimize cross-module direct coupling. Use a public API (game.modules.get('id').api).
Use Custom Hooks: Use Hooks.call('myMod.event') if the event is interceptable/cancellable (allows returning false). Use Hooks.callAll() for non-cancellable broadcast events.
Manifest Synchronization: Autonomously update module.json when files change.
4. Performance, Async Batching & Robustness
Batch Async DB Operations: NEVER call document mutation methods (update(), delete()) inside loops. ALWAYS use batch methods (Document.updateDocuments(), Document.createDocuments()).
Targeted Error Handling:
Fast-fail on synchronous internal logic.
Mandatory: Wrap async I/O, network calls, dynamic imports, and global Hook callbacks in try/catch (with console.error()) to ensure an isolated module failure never crashes the core Foundry canvas.
Minimalist Style: ESNext syntax (?., ??). JSDoc ONLY for public API methods and Hook signatures.
5. Autonomous Localization Protocol (i18n)
Zero Hardcoded Strings: UI text in .js or .hbs MUST use localization keys (MODULE_ID.Scope.Key).
Synchronous Sync: When creating new UI elements, immediately add the key-value pairs to lang/en.json (alphabetically sorted) and use game.i18n.localize() or {{localize}}.