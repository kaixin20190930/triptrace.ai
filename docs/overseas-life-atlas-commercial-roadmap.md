# TripTrace.ai Overseas Life Atlas Commercial Roadmap

Last updated: 2026-07-28 Asia/Shanghai

## 1. Product Decisions

This roadmap is based on three fixed constraints:

1. The primary audience is overseas, with English-speaking users in the US and Europe as the first market.
2. Public historical content is the acquisition engine; private personal Life Atlas creation is the conversion and retention product.
3. TripTrace.ai is a digital-only business. Printed books, physical gifts, and physical distribution are out of scope.
4. The launch product is responsive Web only. Native applications are not on the active roadmap.
5. English is the only launch language. The data and UI architecture remain locale-ready, but translated SEO pages are not produced before demand is measured.

The phrase "historical OS" in this roadmap means an operating system for exploring historical people and events across time and place.

## 2. Product Positioning

TripTrace.ai should not initially market itself as a broad "Life OS." That category is difficult to understand and already crowded.

The primary product category is:

> An AI Life Atlas that turns places, moments, people, and sources into a living map across time.

The public product promise is:

> Explore remarkable lives through time and place.

The private product promise is:

> Turn your own photos, places, and memories into a living map of your life.

The shared slogan is:

> Every trip leaves traces. Every trace tells a story.

## 3. One Engine, Two Products

### 3.1 Public History Atlas

The public product is indexable, source-backed, and designed for discovery.

Primary jobs:

- Understand where a historical person went and what happened there.
- Play a life chronologically on a map.
- Compare events, routes, periods, and relationships.
- Inspect sources and confidence instead of reading unsupported AI prose.
- Share or embed a useful historical Atlas.

Primary users:

- History enthusiasts
- Students and teachers
- Travelers researching places through people
- Writers, documentary researchers, and creators
- Museums, heritage organizations, and tourism organizations

### 3.2 Private Personal Life Atlas

The private product is non-indexable by default and designed for conversion, retention, and subscription.

Primary jobs:

- Turn photos and notes into structured life traces.
- See life events on a synchronized map and timeline.
- Search past places, people, and moments.
- Revisit meaningful memories.
- Create a digital, shareable replay without making the entire Atlas public.

Primary users:

- People aged 25-45 with large travel and everyday photo libraries
- People whose notes and photos are scattered across devices and services
- Expats, international students, and digital nomads
- Couples and families, later, after individual retention is proven

### 3.3 Separation Rules

Public historical data and private personal data must never share the same permission model.

Public history requires:

- Sources
- Attribution
- Editorial review
- Confidence and uncertainty
- Revision history

Private personal data requires:

- Private-by-default visibility
- Explicit sharing
- Export
- Deletion
- Consent-aware imports
- Clear AI-processing disclosure

## 4. Shared Core: Trace Graph

The current memory-card object should evolve into a shared Trace Graph.

Core entities:

- `Person`
- `Trace`
- `Place`
- `TimeRange`
- `Event`
- `Media`
- `Source`
- `Relationship`
- `Story`
- `Atlas`

Minimum `Trace` fields:

- Stable ID
- Atlas ID
- Person or subject IDs
- Start and end time
- Time precision and uncertainty
- Place name
- Latitude and longitude
- Place precision and uncertainty
- Event type
- Factual summary
- AI-generated narrative
- Media references
- Source references
- Confidence level
- Visibility
- Created by
- Reviewed by
- Created and updated timestamps

Critical rule:

> Facts, sources, and AI-generated narrative must be stored separately.

## 5. Final MVP Definition

The final MVP is complete only when all three surfaces work together: public history discovery, personal Life Atlas creation, and editorial publishing.

### 5.1 Public History MVP

Required:

- English-first person route such as `/people/marco-polo`
- Search-indexable HTML content
- 2D map synchronized with a timeline
- Play, pause, next, previous, and scrub controls
- Trace cards with time, place, event, media, and source
- Source citations and confidence labels
- Related people, places, and journeys
- Shareable canonical URL
- Open Graph image and structured data
- CTA: "Create your own Life Atlas"
- Analytics for page, map, timeline, source, related-content, and CTA interactions

Not required:

- User-generated historical publishing
- Full 3D globe
- Collaborative historical editing
- Historical discussion community

### 5.2 Personal Life Atlas MVP

Required:

- No-account interactive demo
- Import text, 1-20 photos, or both
- Extract EXIF time and location when available
- Manually correct time, place, people, and event
- AI-generate a story without replacing factual fields
- Save after sign-up
- Private-by-default Atlas
- 2D map and synchronized timeline
- Search and filter by place, year, person, and keyword
- Revisit an existing trace
- Share one selected trace or replay through an explicit link
- Digital export in JSON and image/video-ready formats
- Delete trace, media, account, and exported share links

Not required:

- Passive continuous location tracking
- Native mobile applications
- Wearable integrations
- Public social feed growth features
- Family collaboration
- Advanced health and financial tracking
- Unlimited AI chat

### 5.3 Editorial and Admin MVP

Required:

- Import historical traces from CSV or JSON
- Draft, review, publish, unpublish, and revise
- Source URL, title, publisher, author, and date fields
- Confidence and uncertainty controls
- Duplicate detection
- Slug, canonical URL, title, description, and social image controls
- Sitemap inclusion
- Publication checklist
- Basic content-performance dashboard

## 6. SEO Acquisition Strategy

Historical content must provide genuine interactive value. It must not become a high-volume AI page factory.

Each page must include:

- A useful map and playable timeline
- Original organization or analysis
- Named sources
- Clear authorship or editorial ownership
- A revision date based on real changes
- Relevant internal links
- Licensed or public-domain media
- A conversion CTA connected to the page context

Google explicitly prioritizes helpful, reliable, people-first content and warns against scaled AI pages created mainly to manipulate rankings:

- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://developers.google.com/search/docs/fundamentals/using-gen-ai-content

### 6.1 Initial English Content Clusters

Start with people whose lives are strongly spatial and chronological:

- Explorers and travelers
- Writers in exile or migration
- Scientists and inventors who moved between institutions
- Artists with distinct geographic periods
- Political leaders with documented campaigns or journeys

Do not publish hundreds of thin pages.

Initial target:

- 3 editorial-quality prototypes
- 10 fully reviewed pages
- 30 pages only after the first cluster shows impressions, engagement, and links

### 6.2 History-to-Personal Funnel

The intended funnel is:

1. Search result
2. Historical Life Atlas page
3. Timeline or map playback
4. Related trace exploration
5. "Create your own Life Atlas" CTA
6. No-account personal demo
7. Demo completed
8. Sign-up to save
9. First Atlas saved
10. First revisit
11. Upgrade for continued storage, search, or replay

## 7. Digital-Only Commercial Model

### 7.1 Public History

Public historical Atlas pages remain free.

Their role is:

- SEO acquisition
- Brand authority
- Product demonstration
- Link acquisition
- Education and institutional lead generation

### 7.2 Guest and Personal Free

Confirmed launch limits:

- One personal Atlas
- One complete no-account generation that cannot be stored permanently
- Up to 3 permanently saved traces after registration
- Basic 2D map and timeline
- Limited AI story generation
- Limited storage
- Basic digital export

The guest flow must demonstrate the complete creation value before asking for an account. The registered free plan must prove saving and revisiting without carrying unlimited storage or AI cost.

### 7.3 Personal Plus

Confirmed founding launch price:

- `$9.99/month`
- `$79/year`
- Up to 500 traces
- Up to 50 AI generations per month
- Up to 20 images per trace, subject to storage fair-use controls

Paid value:

- Unlimited or high-limit traces
- Larger media storage
- Advanced AI organization
- Natural-language memory search
- Full-life timeline
- Route replay
- Advanced digital exports
- Private share-link controls
- Future 3D replay

Do not monetize individual text-generation clicks. Monetize continuity, storage, retrieval, replay, privacy controls, and export.

### 7.4 Personal Pro

Pro is a post-launch tier, not a Paid Public Alpha dependency.

Target price:

- `$19/month`
- `$190/year`

Pro must not launch until it has a credible value difference:

- Higher-volume imports
- More storage and AI usage
- Advanced retrieval and organization
- Annual and multi-year replay
- Advanced export
- Future 3D Life Atlas
- Priority processing or support

The `$19/month` target is retained as the premium price anchor, but it is not used as the only launch plan because that would confound willingness-to-pay with unproven product value.

### 7.5 Creator Pro

Not part of the first personal MVP.

Later test:

- `$12/month`
- `$99/year`

Paid value:

- Public Atlas builder
- Source workflow
- Custom themes
- Embeds
- Analytics
- Higher publishing limits
- Custom domains later

### 7.6 Education and Institutions

After Creator Pro is proven:

- Teacher plan: `$99-199/year`
- Small institution: `$499-2,000/year`
- Custom digital exhibition: `$3,000-20,000/project`

Potential customers:

- Schools and universities
- Museums
- Heritage organizations
- Tourism organizations
- Documentary and publishing teams

No physical fulfillment is included.

## 8. Roadmap and Stage Gates

### Phase 0: Foundation, Weeks 1-4

Deliver:

- Trace Graph specification
- Public/private permission specification
- Analytics event specification
- Historical editorial standard
- Brand and trademark risk review
- Architecture decision for the 2D map

Gate:

- One historical and one personal sample can use the same Trace Graph without permission leakage.

### Phase 1: Historical Acquisition Engine, Weeks 5-10

Deliver:

- Historical page template
- 2D synchronized map and timeline
- Source and confidence UI
- CSV/JSON editorial import
- First 3 reviewed English historical Atlases
- SEO metadata, structured data, sitemap, and internal links

Gate:

- Pages are indexable and pass manual source review.
- At least 20% of engaged visitors interact with the map or timeline.

### Phase 2: Personal Activation MVP, Weeks 8-14

Deliver:

- No-account photo demo
- EXIF extraction
- Trace clustering
- Fact correction
- AI story generation
- Sign-up and save
- Private Atlas
- 2D personal map and timeline

Gate:

- Median time to first useful Atlas is under 3 minutes.
- At least 40% of demo starters complete the demo.
- At least 20% of demo completers sign up to save.

### Phase 3: Retention Loop, Weeks 15-22

Deliver:

- Search and filters
- Memory resurfacing
- Weekly or monthly revisit email
- Related personal traces
- Digital share link
- Export and deletion

Gate:

- D7 activated-user retention is at least 20%.
- At least 25% of activated users create a second trace within 7 days.
- At least 20% revisit an old trace within 30 days.

### Phase 4: Commercial MVP, Weeks 23-30

Deliver:

- Subscription billing
- Entitlements and quotas
- Personal Plus
- Upgrade surfaces triggered by genuine limits
- Billing analytics
- Cancellation and data-access guarantees

Gate:

- Free-to-paid conversion reaches 2-4%.
- Monthly paid churn stays below 5%, or annual intent is validated through preorders.
- AI, storage, map, and bandwidth costs support at least 75% gross margin.

### Phase 5: Premium Replay, Months 8-12

Deliver only after retention:

- 3D terrain or globe replay
- Cinematic route playback
- Higher-quality digital video export
- Compare years or life periods

Gate:

- At least 30% of retained users use 2D replay.
- At least 10% of retained users explicitly request richer replay.

### Phase 6: Creator and Institution, Months 12-18

Deliver:

- Public Atlas authoring
- Embeds
- Organization workspaces
- Editorial roles
- Institutional analytics
- Digital exhibition templates

## 9. Metrics

### Acquisition

- Indexed historical pages
- Search impressions
- Search CTR
- Non-branded search traffic
- Referring domains
- Historical page engagement time

### History Engagement

- Map interaction rate
- Timeline play rate
- Trace-open rate
- Source-open rate
- Related-page click rate

### Conversion

- Personal CTA click rate
- Demo start rate
- Demo completion rate
- Sign-up-to-save rate
- First Atlas saved

### Retention

- Second trace within 7 days
- D7 and D30 activated-user retention
- Old-trace revisit rate
- Search usage
- Share or export rate

### Revenue

- Free-to-paid conversion
- Annual plan share
- ARPU
- Paid churn
- AI cost per active user
- Storage and bandwidth cost per active user
- Gross margin

## 10. Critical Risks

### Brand

Other products already use the TripTrace name, including a travel-history service and an iOS travel-tracker app. Complete trademark and app-store naming review before paid acquisition or native app investment.

### SEO

Mass-produced AI history pages may fail to rank or may create spam-policy risk. Publish slowly and require sources, editorial ownership, and interactive value.

### Privacy

The overseas product must support GDPR/UK GDPR/CCPA expectations, explicit sharing, deletion, export, and clear AI-processing disclosure.

### Product Scope

Do not build 3D, a social network, family collaboration, passive tracking, and a historical creator platform at the same time.

### Historical Accuracy

Historical uncertainty is a product feature, not an error to hide. Display confidence and source disagreement.

## 11. Immediate Priority

The next implementation milestone is:

> One source-backed historical Life Atlas and one private personal Life Atlas running on the same Trace Graph, both using the same synchronized 2D map and timeline.
