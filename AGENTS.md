# GPEC Website Agent Guide

## Project purpose

Build and maintain a clear, trustworthy website for GPEC, an engineering and supply company. The website should help visitors understand GPEC's services, explore verified projects and products, and contact the company for advice or a quote.

Use [`README.md`](README.md) as the source brief for company services, recommended pages, website behavior, and launch requirements.

## Content rules

- Keep descriptions accurate, direct, and understandable to both technical and nontechnical customers.
- Preserve all nine business areas in the README: electrical control and distribution panels, solar energy, electrical sales, solar sales, solar accessories, electrical accessories, electronics, industrial products, and industrial accessories.
- Do not invent company history, locations, clients, projects, testimonials, credentials, certifications, product brands, stock, prices, warranties, savings, or performance figures.
- Use clearly marked placeholders when GPEC has not supplied required information. Do not present placeholder copy as fact.
- Publish customer names, project photographs, drawings, and testimonials only when GPEC has permission.
- Distinguish completed projects from current work and show update dates for active project updates.
- Explain technical terms in plain language without removing important specifications or safety details.

## Website requirements

- Make the site responsive and usable on phones, tablets, and desktop screens.
- Keep navigation simple: Home, About, Services, Products, Projects, Current Work, and Contact.
- Provide clear contact or quote actions from service, product, and project pages.
- Keep product details useful for purchasing: category, model, specifications, compatibility, availability, and quote path when known.
- Make quote forms easy to complete. Request only information GPEC needs to respond, and include privacy wording for personal data and file uploads.
- Use semantic HTML, descriptive page titles, accessible labels, keyboard navigation, visible focus states, sufficient contrast, and alternative text for meaningful images.
- Optimize images and page loading. Never use stock photography in a way that implies it depicts GPEC's real projects or staff.
- Protect admin tools, customer inquiries, and uploaded files. Use HTTPS and keep dependencies and backups maintained.

## Design direction

Use a professional engineering visual style with clear typography, strong contrast, and restrained color. Establish colors from GPEC's supplied logo or brand guide. Use real project and product images where available. Keep layouts calm and scannable, with service summaries, project evidence, and contact actions easy to find.

## Implementation workflow

1. Review `README.md` and existing project files before changing structure or content.
2. Whenever `README.md` changes, review `AGENTS.md` in the same task. Update `AGENTS.md` whenever the README change affects project scope, content rules, design requirements, or implementation workflow. Keep company facts and detailed service descriptions in `README.md` as the single source of truth; do not copy them into `AGENTS.md`.
3. Check whether GPEC has provided brand assets, approved photographs, real contact details, product data, and project information.
4. Build reusable page sections and components so staff can keep content consistent.
5. Keep site copy separate from layout where the chosen stack supports editable content.
6. Use placeholders for missing company information and list those items for GPEC to confirm.
7. Before delivery, verify links, forms, responsive layouts, accessibility basics, spelling, and page metadata.
8. Summarize changed files and any company details still needed.

## Scope boundaries

- Do not publish or deploy the website without explicit direction.
- Do not send messages to customers or third parties.
- Do not add analytics, tracking, advertising, or external form services without a clear project need and appropriate privacy information.
- Do not make electrical design, code compliance, or safety claims on GPEC's behalf. Use GPEC-approved technical content and recommend qualified review for safety-critical material.
