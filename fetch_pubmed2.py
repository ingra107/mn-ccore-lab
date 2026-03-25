"""
Second pass: fetch full details by PMID for papers where we know the correct PMID.
Also retry searches for papers not found.
"""
import requests
import time
import json
import xml.etree.ElementTree as ET

BASE_SEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
BASE_FETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'

# Correct PMIDs identified from the first pass
# Format: paper_id -> PMID
correct_pmids = {
    "hilliard-2026-cardiac-monitoring": "41616031",
    "olson-2026-pccm-job-offers": "41734005",
    "amagai-2025-icu-readmission-epidemiology": "41165278",
    "thakkar-2025-llm-vs-traditional-ie": "40373001",
    "mesfin-2025-loc-variation": "41142473",
    "gao-2025-clif-correspondence": "40658245",  # 2nd result, not 1st
    "byrd-2024-deterioration-definition": "38832836",
    "rajamani-2024-building-to-learn": "39036531",
    "bramante-2024-metformin-viral-load": "38690892",
    "king-2024-appendicitis-cci": "38285892",
    "boulware-2023-vaccination-severity": "36124697",
    "ikramuddin-2023-discharge-disposition": "37053224",
    "castro-pearson-2023-proteomic-covid": "37985892",  # original, not correction
    "kalinoski-2023-mrsa-pneumonia": "37837186",
    "ingraham-2023-laps2-medcare": "37308947",
    "ingraham-2023-equity-cds": "35943199",
    "sun-2022-chest-xray-ai": "35923381",  # 2nd result
    "bramante-2022-vaccination-viral-load": "35392460",
    "lupei-2022-cds-prognostic": "34986168",
    "abdelwahab-2022-pasc-rehab": "35569640",  # 2nd result
    "usher-2022-interhospital-coordination": "34569998",
    "jennaro-2022-acylcarnitines-sepsis": "35160078",
    "ingraham-2022-admission-diagnosis-trends": "33353475",
    "ingraham-2022-disparities-covid": "34003427",
    "karam-2021-mtor-covid": "33314219",
    "lusczek-2021-covid-phenotypes": "33788884",
    "puskarich-2021-losartan-outpatient": "34195577",
    "ingraham-2021-omicron-unknowns": "34911167",
    "ibrahim-2021-metformin-mechanisms": "34367059",
    "bramante-2021-metformin-severity": "33580540",  # 5th result
    "ingraham-2021-pancreatitis-trends": "34129395",
    "sahoo-2021-rule-based-covid": "34423261",
    "dutta-2021-obesity-treatment": "33648370",  # 2nd result
    "ingraham-2021-discordant-cpr": "32949762",
    "tignanelli-2020-antihypertensives-covid": "32222166",  # 3rd result
    "ingraham-2020-functional-status": "32886469",
    "vakayil-2020-surgical-icu-trends": "32384370",  # 2nd result
    "ingraham-2020-hydroxychloroquine": "32345336",
    "ingraham-2020-cci-liver-transplant": "31618109",
    "ingraham-2020-raas": "32341103",
    "wong-2019-dnr-cpr-case-series": "31790757",
    "macdonald-2018-smoking-hiv": "29985804",  # 2nd result
    "ingraham-2017-prosthetic-joint-mai": "28280641",
}


def fetch_pubmed_details(pmids):
    """Fetch full details for a list of PMIDs."""
    params = {
        'db': 'pubmed',
        'id': ','.join(pmids),
        'retmode': 'xml',
        'rettype': 'full'
    }
    r = requests.get(BASE_FETCH, params=params)
    root = ET.fromstring(r.text)

    results = {}
    for article in root.findall('.//PubmedArticle'):
        pmid_el = article.find('.//PMID')
        pmid = pmid_el.text if pmid_el is not None else None

        # Title
        title_el = article.find('.//ArticleTitle')
        title = ''.join(title_el.itertext()).strip() if title_el is not None else None
        if title and title.endswith('.'):
            title = title[:-1]

        # Authors - FULL list
        authors = []
        for author in article.findall('.//Author'):
            lastname = author.find('LastName')
            initials = author.find('Initials')
            collective = author.find('CollectiveName')
            if lastname is not None and initials is not None:
                authors.append(f"{lastname.text} {initials.text}")
            elif collective is not None:
                authors.append(collective.text)
        author_str = ', '.join(authors) + '.' if authors else None

        # Journal - full name
        journal_el = article.find('.//Journal/Title')
        journal = journal_el.text if journal_el is not None else None

        # Year
        year_el = article.find('.//PubDate/Year')
        if year_el is None:
            year_el = article.find('.//PubDate/MedlineDate')
        year = int(year_el.text[:4]) if year_el is not None else None

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

        results[pmid] = {
            'pmid': pmid,
            'title': title,
            'authors': author_str,
            'journal': journal,
            'year': year,
            'doi': f"https://doi.org/{doi}" if doi else None,
            'pubmed_url': f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        }

    return results


# Fetch all in batches of 20
all_pmids = list(correct_pmids.values())
all_details = {}

for i in range(0, len(all_pmids), 20):
    batch = all_pmids[i:i+20]
    print(f"Fetching batch {i//20 + 1}: PMIDs {batch[:3]}...")
    details = fetch_pubmed_details(batch)
    all_details.update(details)
    time.sleep(0.5)

# Now map back to paper IDs
final = {}
for paper_id, pmid in correct_pmids.items():
    if pmid in all_details:
        final[paper_id] = all_details[pmid]
    else:
        print(f"WARNING: PMID {pmid} not found in fetch results for {paper_id}")

# Print full details
for paper_id, d in final.items():
    print(f"\n{'='*60}")
    print(f"Paper: {paper_id}")
    print(f"PMID: {d['pmid']}")
    print(f"Title: {d['title']}")
    print(f"Authors: {d['authors']}")
    print(f"Journal: {d['journal']}")
    print(f"Year: {d['year']}")
    print(f"DOI: {d['doi']}")
    print(f"PubMed: {d['pubmed_url']}")

# Save
with open('pubmed_final.json', 'w') as f:
    json.dump(final, f, indent=2)

print(f"\n\nSaved {len(final)} papers to pubmed_final.json")
