"""
Fetch full PubMed metadata for all publications in publications.ts
"""
import requests
import time
import json
import xml.etree.ElementTree as ET
import re
import sys

BASE_SEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
BASE_FETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'

# Papers to look up: (id, search_query)
# Using title keywords + author for best matching
papers = [
    ("hilliard-2026-cardiac-monitoring", "Hilliard[Author] AND Aligning Cardiac Monitoring AHA Guidelines"),
    ("lyons-2026-federation-paradigm", "Lyons PG[Author] AND Federation Not Centralization Critical Care Research"),
    ("olson-2026-pccm-job-offers", "Olson[Author] AND Pulmonary Critical Care Medicine Job Offers"),
    ("amagai-2025-icu-readmission-epidemiology", "Amagai[Author] AND Epidemiology ICU Readmissions Health Systems"),
    ("thakkar-2025-llm-vs-traditional-ie", "Thakkar[Author] AND Large Language Models Traditional Information Extraction"),
    ("mesfin-2025-loc-variation", "Mesfin[Author] AND Limitations of Care Hospitalized COVID-19"),
    ("gao-2025-clif-correspondence", "Gao CA[Author] AND CLIF AND Intensive Care Medicine AND 2025[PDAT]"),
    ("ingraham-2025-icu-readmissions", "Ingraham NE[Author] AND Predictors Outcomes Early ICU Readmission"),
    ("byrd-2024-deterioration-definition", "Byrd[Author] AND Unplanned ICU Transfers Deterioration Patient Outcomes"),
    ("rajamani-2024-building-to-learn", "Rajamani[Author] AND Building to Learn IT Innovations Pragmatic"),
    ("bramante-2024-metformin-viral-load", "Bramante[Author] AND Antiviral Effect Metformin SARS-CoV-2 Viral Load"),
    ("king-2024-appendicitis-cci", "King S[Author] AND Appendicitis Treatment Mortality Critical Illness"),
    ("ingraham-2024-cci-definition", "Ingraham NE[Author] AND Chronic Critical Illness Electronic Health Record"),
    ("ingraham-2024-ehr-primary-provider", "Ingraham NE[Author] AND Primary Intensivist Electronic Health Record"),
    ("boulware-2023-vaccination-severity", "Boulware[Author] AND Vaccination Booster COVID-19 Symptom Severity"),
    ("ikramuddin-2023-discharge-disposition", "Ikramuddin[Author] AND Discharge Disposition Mortality SARS-CoV-2"),
    ("castro-pearson-2023-proteomic-covid", "Castro-Pearson[Author] AND Proteomic Signature Severe Disease COVID-19"),
    ("kalinoski-2023-mrsa-pneumonia", "Kalinoski[Author] AND MRSA Pneumonia Negative Nasal Swab"),
    ("ingraham-2023-covid-out-longcovid", "Ingraham NE[Author] AND Metformin Ivermectin Fluvoxamine Long Covid"),
    ("ingraham-2023-laps2-medcare", "Kohn[Author] AND LAPS2 In-Hospital Mortality ICU"),
    ("ingraham-2023-equity-cds", "Ingraham NE[Author] AND Equity Clinical Decision Support Surgical Critical"),
    ("sun-2022-chest-xray-ai", "Sun[Author] AND Chest Radiograph AI COVID-19 Radiology"),
    ("bramante-2022-vaccination-viral-load", "Bramante[Author] AND Vaccination SARS-CoV-2 Lower Viral Load"),
    ("lupei-2022-cds-prognostic", "Lupei[Author] AND 12-Hospital Clinical Decision Support Prognostic"),
    ("abdelwahab-2022-pasc-rehab", "Abdelwahab[Author] AND Postacute Sequelae COVID-19 Rehabilitation"),
    ("usher-2022-interhospital-coordination", "Usher[Author] AND COVID-19 Interhospital Resource Coordination"),
    ("jennaro-2022-acylcarnitines-sepsis", "Jennaro[Author] AND Acylcarnitines Amino Acids Septic Shock"),
    ("ingraham-2022-admission-diagnosis-trends", "Ingraham NE[Author] AND Recent Trends Admission Diagnosis Mortality Medically Critically Ill"),
    ("ingraham-2022-icu-trends", "Ingraham NE[Author] AND Trends ICU Utilization Patient Complexity COVID-19 Pandemic"),
    ("ingraham-2022-disparities-covid", "Ingraham NE[Author] AND Racial Ethnic Disparities Hospital Admissions COVID-19 Neighborhood Deprivation"),
    ("karam-2021-mtor-covid", "Karam[Author] AND mTOR Inhibition COVID-19 RNA Viruses"),
    ("lusczek-2021-covid-phenotypes", "Lusczek[Author] AND COVID-19 Clinical Phenotypes Comorbidities"),
    ("puskarich-2021-losartan-outpatient", "Puskarich[Author] AND Losartan Symptomatic Outpatients COVID-19"),
    ("ingraham-2021-omicron-unknowns", "Ingraham NE[Author] AND Omicron SARS-CoV-2 Known Unknowns"),
    ("ibrahim-2021-metformin-mechanisms", "Ibrahim[Author] AND Metformin Covid-19 Mechanisms"),
    ("bramante-2021-metformin-severity", "Bramante[Author] AND Outpatient Metformin Reduced Severity COVID-19"),
    ("silverman-2021-nlp-covid-symptoms", "Silverman[Author] AND NLP Extraction Symptoms Prognostic COVID-19"),
    ("ingraham-2021-pancreatitis-trends", "Ingraham NE[Author] AND Morbidity Mortality Trends Pancreatitis"),
    ("sahoo-2021-rule-based-covid", "Sahoo[Author] AND Rule-Based System COVID-19 Symptom Identification"),
    ("dutta-2021-obesity-treatment", "Dutta[Author] AND Evidence-Based Treatment Obesity"),
    ("ingraham-2021-discordant-cpr", "Ingraham NE[Author] AND Discordant Cardiopulmonary Resuscitation Code Status"),
    ("ingraham-2021-omicron-therapeutics", "Ingraham NE[Author] AND Therapeutic Options COVID-19 Variants"),
    ("tignanelli-2020-antihypertensives-covid", "Tignanelli[Author] AND Antihypertensive Drugs Risk COVID-19"),
    ("ingraham-2020-functional-status", "Ingraham NE[Author] AND National Trends Variation Functional Status Deterioration"),
    ("vakayil-2020-surgical-icu-trends", "Vakayil[Author] AND Epidemiological Trends Surgical Admissions Intensive Care"),
    ("ingraham-2020-hydroxychloroquine", "Ingraham NE[Author] AND Hydroxychloroquine SARS-CoV-2"),
    ("ingraham-2020-cci-liver-transplant", "Ingraham NE[Author] AND Chronic Critical Illness Liver Transplant"),
    ("ingraham-2020-national-trends", "Ingraham NE[Author] AND National Trends Critical Illness Non-Invasive Ventilation 2010 2019"),
    ("ingraham-2020-raas", "Ingraham NE[Author] AND Renin-Angiotensin-Aldosterone-SARS-CoV"),
    ("ingraham-2020-fact-fiction", "Ingraham NE[Author] AND Fact Science Fiction Coronavirus Wisdom Solomon"),
    ("wong-2019-dnr-cpr-case-series", "Wong[Author] AND Do Not Resuscitate CPR Case Series Resuscitation"),
    ("macdonald-2018-smoking-hiv", "MacDonald[Author] AND Smoking Lung Function Decline HIV"),
    ("ingraham-2017-prosthetic-joint-mai", "Ingraham NE[Author] AND Prosthetic Joint Infection Mycobacterium avium"),
]

# Also spot-check some that look complete but missing DOI/PMID
spot_checks = [
    ("shyu-2025-peripheral-vasopressors", None),  # has DOI+PMID, skip
    ("trujeque-2025-nlp-firearm", None),  # has DOI+PMID, skip
    ("rojas-2025-clif-icm", None),  # has DOI+PMID, skip
    ("bramante-2022-covid-out-nejm", None),  # has DOI+PMID, skip
    ("puskarich-2022-losartan", None),  # has DOI+PMID, skip
    ("bramante-2021-metformin-lancethl", None),  # has DOI+PMID, skip
    ("ingraham-2020-immunomod", None),  # has DOI+PMID, skip
]


def search_pubmed(query, retmax=5):
    """Search PubMed and return list of PMIDs."""
    params = {
        'db': 'pubmed',
        'term': query,
        'retmax': retmax,
        'retmode': 'json'
    }
    r = requests.get(BASE_SEARCH, params=params)
    data = r.json()
    return data.get('esearchresult', {}).get('idlist', [])


def fetch_pubmed_details(pmids):
    """Fetch full details for a list of PMIDs."""
    if not pmids:
        return []

    params = {
        'db': 'pubmed',
        'id': ','.join(pmids),
        'retmode': 'xml',
        'rettype': 'full'
    }
    r = requests.get(BASE_FETCH, params=params)
    root = ET.fromstring(r.text)

    results = []
    for article in root.findall('.//PubmedArticle'):
        result = parse_article(article)
        results.append(result)

    return results


def parse_article(article):
    """Parse a PubmedArticle XML element into a dict."""
    result = {}

    # PMID
    pmid_el = article.find('.//PMID')
    result['pmid'] = pmid_el.text if pmid_el is not None else None

    # Title
    title_el = article.find('.//ArticleTitle')
    if title_el is not None:
        # Handle mixed content (italics etc)
        result['title'] = ''.join(title_el.itertext()).strip()
        # Remove trailing period if present
        if result['title'].endswith('.'):
            result['title'] = result['title'][:-1]

    # Authors
    authors = []
    for author in article.findall('.//Author'):
        lastname = author.find('LastName')
        initials = author.find('Initials')
        collective = author.find('CollectiveName')
        if lastname is not None and initials is not None:
            authors.append(f"{lastname.text} {initials.text}")
        elif collective is not None:
            authors.append(collective.text)
    result['authors'] = ', '.join(authors) + '.' if authors else None

    # Journal
    journal_el = article.find('.//Journal/Title')
    result['journal'] = journal_el.text if journal_el is not None else None

    # Also get ISOAbbreviation
    iso_el = article.find('.//Journal/ISOAbbreviation')
    result['journal_abbrev'] = iso_el.text if iso_el is not None else None

    # Year
    year_el = article.find('.//PubDate/Year')
    if year_el is None:
        year_el = article.find('.//PubDate/MedlineDate')
    result['year'] = int(year_el.text[:4]) if year_el is not None else None

    # DOI
    doi = None
    for aid in article.findall('.//ArticleId'):
        if aid.get('IdType') == 'doi':
            doi = aid.text
            break
    if doi is None:
        for eid in article.findall('.//ELocationID'):
            if eid.get('EIdType') == 'doi':
                doi = eid.text
                break
    result['doi'] = f"https://doi.org/{doi}" if doi else None

    return result


def main():
    results = {}

    for paper_id, query in papers:
        if query is None:
            continue

        print(f"\n{'='*60}")
        print(f"Searching: {paper_id}")
        print(f"Query: {query}")

        pmids = search_pubmed(query)
        print(f"Found PMIDs: {pmids}")

        if pmids:
            details = fetch_pubmed_details(pmids)
            for d in details:
                print(f"  PMID: {d['pmid']}")
                print(f"  Title: {d['title']}")
                print(f"  Authors: {d['authors'][:100]}..." if d['authors'] and len(d['authors']) > 100 else f"  Authors: {d['authors']}")
                print(f"  Journal: {d['journal']}")
                print(f"  Year: {d['year']}")
                print(f"  DOI: {d['doi']}")
                print()

            results[paper_id] = details
        else:
            print("  NO RESULTS FOUND")
            results[paper_id] = []

        time.sleep(0.35)  # Rate limit: ~3 per second

    # Save results
    # Convert to serializable format
    with open('pubmed_results.json', 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n\nSaved results for {len(results)} papers to pubmed_results.json")

    # Summary
    found = sum(1 for v in results.values() if v)
    not_found = sum(1 for v in results.values() if not v)
    print(f"Found: {found}, Not found: {not_found}")

    if not_found:
        print("\nPapers NOT FOUND:")
        for paper_id, details in results.items():
            if not details:
                print(f"  - {paper_id}")


if __name__ == '__main__':
    main()
