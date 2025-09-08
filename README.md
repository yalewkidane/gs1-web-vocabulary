# Web Vocabulary API

A JSON-LD/GS1 web vocabulary service with:

- JSON Schema + SHACL validation
- Canonical JSON-LD expansion/framing
- Type-aware lookups using GS1 AIs (e.g., 414, 417, 01)
- Cursor-based search (max 30 / page) with headers

## Quick start (Docker)

### Prereqs

```bash
Docker & Docker Compose
```


### Run

``` bash 
docker-compose up --build
```


The API will start and (by default) be reachable at:

```arduino
http://localhost:5050
```


Compose maps host 5050 → container 3000. If you change PORT or published ports, update your client baseUrl.

### Environment

Create a .env in the project root (values shown are sane defaults):

```ini
# API
PORT=3000                       # container port; compose maps 5050:3000
CORS_ORIGIN=*                   # or http://localhost:5050
API_KEY=62237dfdafe89d3fbec955b34f3b9b4479dfere48a612c70b591cd5b5837d3aad0a6ac48

# MongoDB
MONGO_URI=mongodb://mongodb:27017/masterdata
NODE_ENV=development
```


The service expects X-API-Key to match API_KEY (via your authMiddleware).

### Base variables (for REST Client / curl)
```less
@apiKey = 62237dfdafe89d3fbec955b34f3b9b4479dfere48a612c70b591cd5b5837d3aad0a6ac48
@port   = 5050
@baseUrl= http://localhost:{{port}}
```

### Endpoints
### 1) Capture (upsert)

#### POST /gs1webvoc/capture

. Body: a single JSON-LD object or an array of JSON-LD objects
. Content-Type: application/ld+json
. Success:

Single: 201 + stored JSON-LD object

Batch (all succeed): 201 + array of JSON-LD objects

Batch (mixed): 207 Multi-Status with per-item results

Query:

ctx=inline|full (default inline) – return simplified @context or full array

### 2) Get by AI + ID (verbatim ID)

GET /gs1webvoc/{ai}/{id}

Uses {ai} to gate type and matches {id} verbatim against _id or mapped identifier

Examples:

414 → gs1:Place (GLN/Location)

417 → gs1:Organization (GLN/Party)

01 → gs1:Product (GTIN)

Query:

view=original|expanded|framed (default original)

ctx=inline|full (default inline)

Returns: 200 JSON-LD (or 404 if not found)

### 3) Search (typed or untyped)

GET /gs1webvoc/search?type=gs1:Place

Returns up to 30 items per page

Cursor headers for pagination:

Next-Page-Token: <token> (when more results exist)

Link: <url-with-next>; rel="next"

Query:

type=gs1:Place (optional – when omitted, searches all types)

view=original|expanded|framed (default original)

ctx=inline|full (default inline)

next=<token> (from previous page)

limit is accepted but capped to 30

CORS note: The API exposes Link and Next-Page-Token headers so browsers can read them.

### Examples

All examples assume:
```less
@apiKey = 62237dfdafe89d3fbec955b34f3b9b4479dfere48a612c70b591cd5b5837d3aad0a6ac48
@port   = 5050
@baseUrl= http://localhost:{{port}}
```

### Posting JSON-LD (batch)
```perl
POST {{baseUrl}}/gs1webvoc/capture
Content-Type: application/ld+json
X-API-Key: {{apiKey}}

[
  {
    "@context": {
      "cbvmda": "urn:epcglobal:cbv:mda",
      "xsd": "http://www.w3.org/2001/XMLSchema#",
      "gs1": "http://gs1.org/voc/",
      "@vocab": "http://gs1.org/voc/",
      "gdst": "https://traceability-dialogue.org/vocab"
    },
    "@type": "gs1:Place",
    "globalLocationNumber": "urn:gdst:example.org:location:loc:importer.124",
    "cbvmda:owning_party": "urn:gdst:example.org:party:importer.1",
    "cbvmda:informationProvider": "urn:gdst:example.org:party:importer.1233",
    "name": [
      { "@language": "en-US", "@value": "Importer Warehouse" }
    ],
    "address": {
      "@type": "gs1:PostalAddress",
      "streetAddress": [
        { "@language": "en-US", "@value": "1345 Estados Unidos" }
      ],
      "addressLocality": [
        { "@language": "en-US", "@value": "Sao Paulo" }
      ],
      "addressRegion": [
        { "@language": "en-US", "@value": "Sao Paulo" }
      ],
      "countryCode": "BR"
    }
  },
  {
    "@context": {
      "cbvmda": "urn:epcglobal:cbvmda:mda",
      "xsd": "http://www.w3.org/2001/XMLSchema#",
      "gs1": "http://gs1.org/voc/",
      "@vocab": "http://gs1.org/voc/",
      "gdst": "https://traceability-dialogue.org/vocab/"
    },
    "@type": "gs1:Organization",
    "globalLocationNumber": "urn:gdst:traceability-solution.com:party:7d90c2cd-a801-4e22-acee-82bf27a4844d",
    "cbvmda:informationProvider": "urn:gdst:traceability-solution.com:party:7d90c2cd-a801-4e22-acee-82bf27a4844d",
    "organizationName": [
      { "@language": "en-US", "@value": "Jim's Feeding Co." }
    ]
  }
]
```

### Get by AI + ID (Place via AI 414)
```http
GET {{baseUrl}}/gs1webvoc/414/urn:gdst:example.org:location:loc:importer.124
Accept: application/ld+json
X-API-Key: {{apiKey}}
```

### Get by AI + ID (Organization via AI 417)
```http
GET {{baseUrl}}/gs1webvoc/417/urn:gdst:traceability-solution.com:party:7d90c2cd-a801-4e22-acee-82bf27a4844d
Accept: application/ld+json
X-API-Key: {{apiKey}}
```

### Search (all types)
```http
GET {{baseUrl}}/gs1webvoc/search
Accept: application/json
X-API-Key: {{apiKey}}
```

### Search (typed – Places only)
```http
GET {{baseUrl}}/gs1webvoc/search?type=gs1:Place
Accept: application/json
X-API-Key: {{apiKey}}
```


Paginating: if the response includes Next-Page-Token header, request the next page with:

```http
GET {{baseUrl}}/gs1webvoc/search?type=gs1:Place&next={{Next-Page-Token}}
Accept: application/json
X-API-Key: {{apiKey}}
```

### Health & readiness

GET /health – simple liveness JSON

GET /gs1webvoc/healthz – router-level check

GET /gs1webvoc/readyz – verifies Mongo connectivity

### Notes / Behavior

ID usage: for AI GET, the {id} is used verbatim (no normalization).

Validation: Ajv (JSON Schema) for surface JSON + SHACL for GS1 graph constraints.

Representations: view=original|expanded|framed, and ctx=inline|full.

Search cap: limit is accepted but always capped to 30. Pagination is via headers.

CORS: Location, ETag, Link, Next-Page-Token are exposed to browsers.

### Troubleshooting

401/403: ensure X-API-Key matches the API_KEY in .env.

ECONNREFUSED Mongo: confirm mongodb service is healthy and MONGO_URI matches compose network host/port.

422 on capture: check response details for Ajv/SHACL violations.

Pagination headers not visible in browser: make sure CORS exposedHeaders includes Link and Next-Page-Token.