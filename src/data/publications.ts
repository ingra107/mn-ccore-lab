import type { Publication } from './types'

export const publications: Publication[] = [
  // ── 2026 ─────────────────────────────────────────────────────────────────

  {
    id: 'ingraham-2026-gdms-lpv',
    authors: 'Ingraham NE, Bromley E, Eddington C, Collins C, Dudley RA, Chipman JG.',
    title: 'Association of General Decision-Making Style with Lung-Protective Ventilation Adherence',
    journal: 'In preparation',
    year: 2026,
    status: 'In Preparation',
    abstract: 'This study examines the relationship between physicians\' general decision-making styles, measured by the GDMS instrument, and their adherence to lung-protective ventilation protocols in the ICU. By linking survey data with clinical EHR data across multiple centers, we characterize how rational, intuitive, dependent, avoidant, and spontaneous decision-making styles predict evidence-based practice adherence.',
    topics: ['decision-making', 'ventilation'],
    authorSlugs: ['nick'],
  },

  {
    id: 'mesfin-2026-dnr',
    authors: 'Mesfin N, Ingraham NE, et al.',
    title: 'DNR Order Variation Across Providers',
    journal: 'In preparation',
    year: 2026,
    status: 'In Preparation',
    abstract: 'Characterizing provider-level variation in DNR order documentation patterns and their association with patient outcomes and goals-of-care conversations.',
    topics: ['decision-making'],
    authorSlugs: ['nate'],
  },

  {
    id: 'mesfin-2026-ihca',
    authors: 'Mesfin N, et al.',
    title: 'In-Hospital Cardiac Arrest Survivability',
    journal: 'In preparation',
    year: 2026,
    status: 'In Preparation',
    abstract: 'A predictive modeling study examining factors that influence survivability after in-hospital cardiac arrest, with the goal of improving prognostication and clinical decision-making.',
    topics: ['decision-making'],
    authorSlugs: ['nate'],
  },

  // ── 2025 ─────────────────────────────────────────────────────────────────

  {
    id: 'ingraham-2025-peripheral-vasopressors',
    authors: 'Ingraham NE, Eddington C, Bromley E, Siuba MT, Maddali MV, Blair PW, Tignanelli CJ.',
    title: 'Incidence and Outcomes of Peripheral Vasopressor Use in Critically Ill Patients: A Multi-Center Analysis',
    journal: 'American Journal of Respiratory and Critical Care Medicine',
    year: 2025,
    status: 'Published',
    topics: ['clif', 'quality'],
    featured: true,
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2025-nlp-firearm',
    authors: 'Ingraham NE, Eddington C, Tignanelli CJ.',
    title: 'Natural Language Processing for Firearm Access Documentation in the Electronic Health Record',
    journal: 'Journal of the American Medical Informatics Association',
    year: 2025,
    status: 'Published',
    topics: ['quality'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2025-clif-icm',
    authors: 'Ingraham NE, Hayek SS, Parker WF, Scherer E, Kairouz V, Sanchez C, Wongvibulsin S, Churpek MM, Gombar S, Dligach D, Afshar M, Mayampurath A, Maddali MV, Siuba MT, Blair PW, Weissman GE, Sinha P, Calfee CS, Tignanelli CJ.',
    title: 'Implementing Multi-Center ICU Research With the Common Longitudinal ICU Format: Lessons From the CLIF Consortium',
    journal: 'Intensive Care Medicine',
    year: 2025,
    status: 'Published',
    topics: ['clif'],
    featured: true,
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2025-icu-readmissions',
    authors: 'Ingraham NE, Eddington C, Collins C, Bromley E, Tignanelli CJ.',
    title: 'Predictors and Outcomes of Early ICU Readmission: A Multi-Center Cohort Study',
    journal: 'Critical Care Explorations',
    year: 2025,
    status: 'Published',
    topics: ['quality', 'clif'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2025-lpv-variation',
    authors: 'Ingraham NE, Collins C, Dudley RA, Chipman JG, Tignanelli CJ.',
    title: 'Provider-Level Variation in Lung-Protective Ventilation Practices in the ICU',
    journal: 'American Journal of Respiratory and Critical Care Medicine',
    year: 2025,
    status: 'In Review',
    abstract: 'Using multi-center CLIF data, this study quantifies the extent to which provider identity explains variation in lung-protective ventilation adherence beyond patient-level factors. We demonstrate substantial provider-level variation that persists after risk adjustment, suggesting targets for provider-focused quality improvement interventions.',
    topics: ['ventilation', 'clif'],
    featured: true,
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2025-ventmode',
    authors: 'Ingraham NE, Tignanelli CJ, et al.',
    title: 'Ventilation Mode Transitions and Outcomes in Mechanically Ventilated ICU Patients',
    journal: 'Journal of the American Medical Informatics Association',
    year: 2025,
    status: 'In Review',
    abstract: 'A multi-center observational study examining how transitions between ventilation modes relate to patient outcomes, leveraging granular CLIF respiratory data to characterize ventilation mode patterns and their prognostic significance.',
    topics: ['ventilation', 'clif'],
    authorSlugs: ['nick'],
  },

  {
    id: 'mesfin-2025-cci-ards',
    authors: 'Mesfin N, Ingraham NE, Eddington C, Bromley E, Tignanelli CJ.',
    title: 'Chronic Critical Illness in ARDS: Incidence, Risk Factors, and Outcomes',
    journal: 'CHEST',
    year: 2025,
    status: 'In Review',
    abstract: 'This study characterizes the incidence and risk factors for chronic critical illness (CCI) among patients with acute respiratory distress syndrome (ARDS) using multi-center ICU data. We identify distinct clinical trajectories and modifiable risk factors that may inform early intervention strategies.',
    topics: ['clif'],
    authorSlugs: ['nate', 'nick'],
  },

  // ── 2024 ─────────────────────────────────────────────────────────────────

  {
    id: 'ingraham-2024-clif',
    authors: 'Ingraham NE, Hayek SS, Parker WF, Scherer E, Kairouz V, Sanchez C, Chen H, Goel A, Mangipudi S, Wongvibulsin S, Bai Y, Hochberg C, Churpek MM, Gombar S, Dligach D, Afshar M, Mayampurath A, Bagheri A, Eickhoff C, Maddali MV, Siuba MT, Blair PW, Weissman GE, Hubbard RA, Fleisher LA, Sinha P, Calfee CS, Tignanelli CJ.',
    title: 'Common Longitudinal ICU data Format (CLIF) — A Multicenter ICU Data Standard',
    journal: 'JAMIA Open',
    year: 2024,
    status: 'Published',
    doi: 'https://doi.org/10.1093/jamiaopen/ooae114',
    abstract: 'This paper introduces the Common Longitudinal ICU data Format (CLIF), a standardized data model designed to enable multi-center ICU research using electronic health record data. CLIF defines a common schema for key ICU clinical domains including vitals, labs, respiratory support, medications, and assessments. The consortium includes 13 academic medical centers.',
    topics: ['clif'],
    featured: true,
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2024-cci-definition',
    authors: 'Ingraham NE, Mesfin N, Eddington C, Bromley E, Tignanelli CJ.',
    title: 'Defining Chronic Critical Illness Using Electronic Health Record Data: A Multi-Center Validation Study',
    journal: 'American Journal of Surgery',
    year: 2024,
    status: 'Published',
    topics: ['clif', 'quality'],
    authorSlugs: ['nick', 'nate'],
  },

  {
    id: 'ingraham-2024-ehr-primary-provider',
    authors: 'Ingraham NE, Eddington C, Collins C, Tignanelli CJ.',
    title: 'Identifying the Primary Intensivist Using Electronic Health Record Data: A Validation Approach',
    journal: 'Critical Care Explorations',
    year: 2024,
    status: 'Published',
    topics: ['quality', 'decision-making'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2024-immunomod-update',
    authors: 'Ingraham NE, Lotfi-Emran S, Engstrom A, Morelli KA, Murray TA, Vakil A, Benson B, Pendleton KM, Lusczek ER, Tignanelli CJ.',
    title: 'Immunomodulation in COVID-19: A Systematic Review and Meta-Analysis Update',
    journal: 'Lancet Respiratory Medicine',
    year: 2024,
    status: 'Published',
    abstract: 'A comprehensive updated systematic review and meta-analysis evaluating immunomodulatory therapies in COVID-19 patients, synthesizing evidence across corticosteroids, IL-6 inhibitors, JAK inhibitors, and other immunomodulators across disease severity strata.',
    topics: ['covid'],
    authorSlugs: ['nick'],
  },

  // ── 2023 ─────────────────────────────────────────────────────────────────

  {
    id: 'ingraham-2023-covid-out-longcovid',
    authors: 'Bramante CT, Buse JB, Ingraham NE, Bodurtha P, Bridges LG, Bury J, Cattamanchi A, Cipolla J, Collins C, Crowley J, Dean JM, Erickson SM, Geng EH, Golden S, Grannis SJ, Haynes D, Huling JD, Johnson J, Johnson SG, Jones P, Karger AB, Kelleher KJ, Kozhimannil KB, Larkin MA, Lee KCL, Lindsley A, MacMillan L, Martin ML, Mitchell NB, Modi H, Murray TA, Nicklas JM, Odom E, Okafor C, Poleon M, Puskarich MA, Rosario R, Ruff C, Schechter-Perkins EM, Sheridan P, Shimpi RA, Smith BM, Tignanelli CJ, Thompson MA, Winkelman JW, Wynn KK, Yoo KM, Zwald M.',
    title: 'Outpatient Treatment of Covid-19 with Metformin, Ivermectin, and Fluvoxamine and the Development of Long Covid over 10-Month Follow-Up',
    journal: 'The Lancet Infectious Diseases',
    year: 2023,
    status: 'Published',
    doi: 'https://doi.org/10.1016/S1473-3099(23)00299-2',
    abstract: 'In this pre-specified secondary analysis of the COVID-OUT randomized trial, we evaluated the effect of metformin, ivermectin, and fluvoxamine on the risk of developing Long COVID. Metformin was associated with a 41% reduction in Long COVID risk over 10 months of follow-up.',
    topics: ['covid'],
    featured: true,
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2023-laps2-medcare',
    authors: 'Ingraham NE, Eddington C, Tignanelli CJ.',
    title: 'Validation of the Laboratory-Based Acute Physiology Score (LAPS2) for Inpatient Mortality Prediction',
    journal: 'Medical Care',
    year: 2023,
    status: 'Published',
    topics: ['quality'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2023-equity-cds',
    authors: 'Ingraham NE, Tignanelli CJ, et al.',
    title: 'Equity Considerations in Clinical Decision Support Tools for Surgical and Critical Care Patients',
    journal: 'Annals of Surgery',
    year: 2023,
    status: 'Published',
    topics: ['quality', 'disparities'],
    authorSlugs: ['nick'],
  },

  // ── 2022 ─────────────────────────────────────────────────────────────────

  {
    id: 'bramante-2022-covid-out-nejm',
    authors: 'Bramante CT, Huling JD, Tignanelli CJ, Ingraham NE, Puskarich MA, Smith BM, Murray TA, Maginnis MS, Gildemeister S, Odean V, Beckman KB, Arbet J, Mehta T, Thompson MA, Schechter-Perkins EM, Nicholson J, Cohn E, Sheridan P, Jelen M, Karger AB, Lesnick T, Winkelman JW, Buse JB, Dean JM.',
    title: 'Randomized Trial of Metformin, Ivermectin, and Fluvoxamine for Covid-19',
    journal: 'New England Journal of Medicine',
    year: 2022,
    status: 'Published',
    doi: 'https://doi.org/10.1056/NEJMoa2201662',
    pubmed: 'https://pubmed.ncbi.nlm.nih.gov/35648703/',
    abstract: 'This phase 3, randomized, quadruple-blind trial (COVID-OUT) tested metformin, ivermectin, and fluvoxamine in non-hospitalized adults with COVID-19. Metformin reduced the risk of hypoxemia, emergency department visit, hospitalization, or death by 42% (OR 0.58; 95% CI 0.35–0.94).',
    topics: ['covid'],
    featured: true,
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2022-losartan',
    authors: 'Ingraham NE, Puskarich MA, Omer N, Kapoor A, Burns L, Allen ML, Gaillard PR, Freundlich RE, Chipman JG, Tignanelli CJ.',
    title: 'Effect of Losartan on Acute Respiratory Distress Syndrome Outcomes in COVID-19',
    journal: 'JAMA Network Open',
    year: 2022,
    status: 'Published',
    topics: ['covid'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2022-icu-trends',
    authors: 'Ingraham NE, Eddington C, Tignanelli CJ.',
    title: 'Trends in ICU Utilization and Patient Complexity Over the COVID-19 Pandemic',
    journal: 'Journal of Intensive Care',
    year: 2022,
    status: 'Published',
    topics: ['covid', 'quality'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2022-disparities-covid',
    authors: 'Ingraham NE, Purcell LN, Karam BS, Dudley RA, Usher MG, Luce CA, Warlick JW, Allen ML, Wolfson J, Tignanelli CJ.',
    title: 'Racial/Ethnic Disparities in Hospital Admissions from COVID-19 and the Role of Neighborhood Deprivation and Primary Language',
    journal: 'BMC Public Health',
    year: 2022,
    status: 'Published',
    abstract: 'This study examines racial and ethnic disparities in COVID-19 hospital admissions and their relationship to neighborhood-level social determinants of health. Using geocoded data linked to area deprivation indices, we demonstrate how structural factors including neighborhood deprivation and primary language contribute to observed disparities.',
    topics: ['covid', 'disparities'],
    authorSlugs: ['nick'],
  },

  // ── 2021 ─────────────────────────────────────────────────────────────────

  {
    id: 'bramante-2021-metformin-lancethl',
    authors: 'Bramante CT, Ingraham NE, Murray TA, Maginnis MS, Headley S, Wacker DA, Trondle M, Beckman KB, Mehta T, Puskarich MA, Thompson MA, Tignanelli CJ.',
    title: 'Metformin and Risk of Mortality in Patients Hospitalised with COVID-19: A Retrospective Cohort Analysis',
    journal: 'Lancet Healthy Longevity',
    year: 2021,
    status: 'Published',
    doi: 'https://doi.org/10.1016/S2666-7568(20)30033-7',
    abstract: 'Retrospective cohort analysis of 6,256 adults hospitalized with COVID-19. Metformin use before hospitalization was associated with a significant reduction in in-hospital mortality (OR 0.52; 95% CI 0.37–0.73), providing observational rationale for the COVID-OUT randomized trial.',
    topics: ['covid'],
    featured: true,
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2021-discordant-cpr',
    authors: 'Ingraham NE, Mesfin N, Jones B, Chipman JG, Tignanelli CJ.',
    title: 'Discordant CPR: Characterizing Patients Who Receive Resuscitation Despite DNR Orders',
    journal: 'Journal of Pain and Symptom Management',
    year: 2021,
    status: 'Published',
    topics: ['decision-making'],
    authorSlugs: ['nick', 'nate'],
  },

  {
    id: 'ingraham-2021-omicron-therapeutics',
    authors: 'Ingraham NE, Tignanelli CJ.',
    title: 'Therapeutic Options for COVID-19 Variants: Evolving Evidence and Clinical Guidance',
    journal: 'Clinical Therapeutics',
    year: 2021,
    status: 'Published',
    topics: ['covid'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2021-immunomod',
    authors: 'Ingraham NE, Lotfi-Emran S, Thielen BK, Teber K, Pendleton KM, Lusczek ER, Grim BJ, Piontek AE, Kuo PC, Benson B, Ridgeway JL, Chipman JG, Tignanelli CJ.',
    title: 'Immunomodulation in COVID-19',
    journal: 'Lancet Respiratory Medicine',
    year: 2021,
    status: 'Published',
    abstract: 'An early systematic review of immunomodulatory approaches to treating COVID-19, synthesizing evidence for corticosteroids, anti-cytokine therapies, convalescent plasma, and other immunologic interventions. This work helped inform clinical practice during the early phases of the pandemic.',
    topics: ['covid'],
    authorSlugs: ['nick'],
  },

  // ── 2020 ─────────────────────────────────────────────────────────────────

  {
    id: 'ingraham-2020-national-trends',
    authors: 'Ingraham NE, Vakil A, Chipman JG, Tignanelli CJ.',
    title: 'National Trends in Critical Illness and Non-Invasive Ventilation from 2010 to 2019',
    journal: 'Critical Care Medicine',
    year: 2020,
    status: 'Published',
    topics: ['quality', 'ventilation'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2020-raas',
    authors: 'Ingraham NE, Barakat AG, Reilkoff R, Bezdicek T, Schacker T, Chipman JG, Tignanelli CJ, Puskarich MA.',
    title: 'Understanding the Renin-Angiotensin-Aldosterone-SARS-CoV Connection: A Review',
    journal: 'European Respiratory Journal',
    year: 2020,
    status: 'Published',
    abstract: 'A mechanistic review of the interplay between SARS-CoV-2 and the renin-angiotensin-aldosterone system (RAAS). This paper examines ACE2 receptor biology, the theoretical implications of RAAS inhibitor use during COVID-19 infection, and the clinical evidence for or against modification of these therapies.',
    topics: ['covid'],
    authorSlugs: ['nick'],
  },

  {
    id: 'ingraham-2020-fact-fiction',
    authors: 'Ingraham NE, Tignanelli CJ.',
    title: 'Fact vs Science Fiction: Fighting Coronavirus Disease 2019 Requires the Wisdom of Solomon, Not the Sword',
    journal: 'Critical Care Explorations',
    year: 2020,
    status: 'Published',
    abstract: 'An editorial commentary on the challenge of evidence-based decision-making during the early COVID-19 pandemic, emphasizing the need for rigorous clinical trial evidence over untested therapeutic interventions and the importance of clinical equipoise.',
    topics: ['covid'],
    authorSlugs: ['nick'],
  },
]
