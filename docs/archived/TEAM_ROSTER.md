# MN-CCORE Lab Team Roster

> **Not the source of truth** as of Phase 35 (2026-04-18). Roster data
> now lives in the `team_members` D1 table + `src/data/team.ts`. This
> file is kept as a historical reference + biographical context that
> never made it into structured fields.
>
> For current team data, use the app or query `/api/team`.
>
> Photo URLs are from UMN Med School bio pages where available.
> Last file-level update: 2026-03-23.

---

## Senior Faculty / Mentors

### R. Adams Dudley, MD, MBA
- **Role:** Senior Mentor
- **Title:** Professor of Medicine
- **Bio:** Nick and Nate's mentor
- **Photo:** _not found on UMN bio site_
- **Profile:** _UMN bio page URL unknown_

### Jeff Chipman, PhD
- **Role:** Senior Mentor / Biostatistician
- **Title:** Statistician Mentor
- **Photo:** https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-08/Copy%20of%20UMN-8471.jpg?itok=UqPdFLCU
- **Profile:** https://med.umn.edu/bio/jeffrey-chipman

---

## Co-Directors

### Nick Ingraham, MD
- **Role:** Co-Director, MN-CCORE
- **Title:** Assistant Professor, Pulmonary & Critical Care Medicine
- **Bio:** Physician-scientist focused on provider variation, lung-protective ventilation, and clinical decision-making in the ICU. Founding member of the CLIF Consortium.
- **Photo:** https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-06/Nick%20Picture_2022.jpg?itok=VEDKgpUN
- **Profile:** https://med.umn.edu/bio/nicholas-ingraham

### Nathan Mesfin, MD
- **Role:** Co-Director, MN-CCORE
- **Title:** Assistant Professor, Critical Care Medicine
- **Bio:** Critical care physician investigating in-hospital cardiac arrest survivability, DNR order variation, and chronic critical illness outcomes.
- **Photo:** https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/dom-faculty-_0135_layer-164_0.png?itok=YWiCOKFA
- **Profile:** https://med.umn.edu/bio/nathan-mesfin

---

## Faculty Collaborators

### Josh Trujeque
- **Role:** Faculty
- **Photo:** _not found_

### Katie Pendleton
- **Role:** Faculty
- **Photo:** _not found_

### Abby Begnaud
- **Role:** Faculty
- **Photo:** _not found_

### Dave MacDonald
- **Role:** Faculty
- **Photo:** _not found_

### Ben Henkle
- **Role:** Faculty
- **Photo:** _not found_

### Dave Wacker
- **Role:** Faculty
- **Title:** Associate Professor of Medicine
- **Credentials:** MD
- **Photo:** https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0028_Layer-271.png?itok=skFv-xW5
- **Profile:** https://med.umn.edu/bio/david-wacker

---

## Research Team

### Emma Bromley
- **Role:** Research Coordinator
- **Photo:** _not found_

### Casey Eddington
- **Role:** Data Analyst
- **Photo:** _not found_

### Dan Shyu, MD
- **Role:** Critical Care Fellow
- **Photo:** _not found_

### Beret Fitzgerald, MD
- **Role:** Critical Care Fellow
- **Photo:** _not found_

### Michael Kalinoski
- **Role:** Medical Student Researcher
- **Photo:** _not found_

### Claire Collins
- **Role:** Medical Student Researcher
- **Photo:** _not found_

---

## Notes for Build Agent

- Photos use UMN's `bio_photo` image style (~300x400px headshots)
- The `?itok=` parameter is a Drupal image token; URLs work without it but may be slower
- For missing photos, consider using initials-based placeholder avatars
- Faculty collaborators may have UMN bio pages under variant URL patterns (e.g., `/bio/dom-faculty/firstname-lastname`) but many returned 403/404 during this search
- The UMN bio URL pattern that works: `https://med.umn.edu/bio/firstname-lastname`
- To find remaining photos later, try searching `https://med.umn.edu/dom/faculty` listing page
