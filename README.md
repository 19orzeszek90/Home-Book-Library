
# 📚 Home Book Library

<p align="center">
  <img src="screenshot.jpg" alt="Home Book Library App Preview" width="800">
</p>

A professional, high-performance web application designed for bibliophiles who need more than just a list. Home Book Library is a complete ecosystem for cataloging, managing, borrowing, and discovering your collection — no AI required.

---

## 🚀 Key Features

### 💎 Intelligent Collection Management
- **Library & Wishlist:** Separate your current collection from your future reads.
- **Collection View:** Automatically groups books into series and cycles, sorted by volume number. Collapsible sections keep the interface clean.
- **Dynamic Views:** Choose between `Compact`, `Default`, or `Cozy` grid sizes.

### 📖 Quick Scan (ISBN)
- **ISBN Barcode Scanner:** Scan or type an ISBN → automatically fetches book data from multiple sources.
- **No AI, No API Keys:** Uses free/open APIs and HTML scraping — no registration or tokens needed.
- **Multi-Source Fallback Chain:** OpenLibrary (global) → Polish book databases (ratings, series, translator, format, cover, subjects) → final fallback OpenLibrary.
- **Rich Metadata:** Automatically fills title, author, publisher, year, pages, description, rating, cover image, series, volume, translator, original title, format, language, subjects, shelf.
- **Activity Feed:** Step-by-step scan log showing which sources were tried and what data was found (✓ success / ✗ fail / 🔍 in progress).

### 📖 Book Borrowing Module
- **Track Borrowings:** Log who borrowed which book, with phone and email contact info.
- **Borrow / Extend / Return:** One-click return from book detail or Command Center.
- **Active Borrowings View:** Command Center shows only currently borrowed books with due dates. Overdue books are highlighted in red.
- **Persistent History:** All borrowings stored in PostgreSQL alongside your library.

### 🛠️ Professional Command Center
- **Bulk Operations:** Select multiple books to update language, format, shelf, or price simultaneously.
- **Database Cleanup:** Manage all genres and tags from a central hub. Merge duplicates or remove obsolete entries.
- **Table View:** Sortable, resizable data table for power users.
- **Borrowings Tab:** Dedicated view to see and manage all active borrowings.

### 📊 Advanced Analytics
- **Reading Journey:** Track annual reading progress with a visual goal banner.
- **Financial Stats:** Monitor your library's economy with average book value and estimated total value.
- **Visual Distributions:** Charts showing genre, rating, and language distributions.

### 🔄 Data Integrity & Portability
- **CSV Export/Import:** UTF-8 with BOM for Excel compatibility (Polish characters display correctly).
- **Full JSON Backups:** Export entire library including covers into a single backup file.
- **Restore from Backup:** Import full JSON snapshots.
- **Persistent Storage:** Fully dockerized with PostgreSQL and local volumes.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS + Vite
- **Backend:** Node.js + Express
- **Database:** PostgreSQL 14
- **Scraping (no AI):** OpenLibrary API + Polish book databases (HTML parsing via JSON-LD, structured tables, data attributes)
- **Deployment:** Docker & Docker Compose

---

## ⚙️ Installation

### Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/19orzeszek90/Home-Book-Library.git
cd Home-Book-Library

# 2. Build & launch
docker compose up --build -d
```

Access your library at `http://localhost:3001`.

### Configuration

- **Port:** Change `3001:3000` in `docker-compose.yml` to any port you prefer.
- **Database credentials:** Edit `POSTGRES_USER` / `POSTGRES_PASSWORD` in `docker-compose.yml` if needed.
- **Scraping works out of the box** — no API keys needed. The Quick Scan feature discovers book data automatically.

---

## 📖 How Quick Scan Works

The ISBN scanner uses a **zero-AI, zero-cost scraping pipeline** that combines multiple free sources:

```
ISBN input
  │
  ├─▶ OpenLibrary API (title, author, publisher)
  │     └─▶ Polish book database (description, rating, cover, series, translator, format)
  │
  ├─▶ Polish book database (direct ISBN lookup)
  │     └─▶ Full metadata (description, rating, cover, series, translator, format)
  │
  └─▶ Polish catalog database (publisher, year, pages, place, subjects)
        └─▶ Polish book database (by title+author → description, rating, cover)
```

**Data sources:**
- **OpenLibrary** — global open book database (free API, no key)
- **Polish book databases** — HTML scraping with structured data extraction (JSON-LD, HTML tables, data attributes)
- **Polish library catalogs** — MAK+ system data (publisher, place, subject headings)

**All data extraction is deterministic** — no AI, no LLMs, no third-party API keys. Every field is parsed from structured HTML elements.

### Activity Feed
Each scan produces a detailed log visible in the Quick Scan modal:
- **🔍** — source being queried
- **✓** — data found (with details: description yes/no, rating value, etc.)
- **✗** — source unavailable or not matching

This makes it easy to see which sources provided which data.

---

## 🛡️ License

This project is licensed under the MIT License.

*Developed with passion for books and clean code.*
