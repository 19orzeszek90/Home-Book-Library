/**
 * Scraper do wyszukiwania książek — OpenLibrary + lubimyczytac.pl + szukamksiążki.pl
 * Prosty fallback: OL → LC → SK, każde źródło niezależnie.
 */
import axios from 'axios';

const urlCache = new Map();

// ─── OpenLibrary ───
async function lookupOpenLibrary(isbn) {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const key = `ISBN:${isbn}`;
  const book = data[key];
  if (!book) return null;

  return {
    title: book.title || '',
    author: (book.authors || []).map(a => a.name).join(', '),
    publisher: (book.publishers || []).map(p => p.name).join(', '),
    publishDate: book.publish_date || '',
    pages: book.number_of_pages || null,
    subjects: (book.subjects || []).map(s => s.name),
  };
}

// ─── Startpage → Lubimyczytac ───
async function findLcUrl(isbn, title, author) {
  const cacheKey = `lc_url:${isbn}:${title}`;
  if (urlCache.has(cacheKey)) return urlCache.get(cacheKey);

  const queries = [];
  if (isbn) queries.push(`lubimyczytac.pl/ksiazka ${isbn}`);
  if (title) {
    const authorSlug = author ? author.split(' ').pop() : '';
    queries.push(`lubimyczytac.pl/ksiazka ${title} ${authorSlug}`);
  }

  for (const query of queries) {
    try {
      const searchUrl = `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}&language=pl_PL`;
      const { data: html } = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pl-PL,pl;q=0.9',
        },
      });
      const matches = [...html.matchAll(/href="(https?:\/\/lubimyczytac\.pl\/ksiazka\/\d+\/[^"]+)"/g)];
      if (matches.length > 0) {
        const found = matches[0][1];
        urlCache.set(cacheKey, found);
        return found;
      }
    } catch (e) { /* próbuj dalej */ }
  }

  urlCache.set(cacheKey, null);
  return null;
}

// ─── Lubimyczytac.pl scrapowanie ───
function extractJSONLD(html) {
  const pattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type'] === 'Book') return data;
    } catch (e) { /* skip */ }
  }
  return null;
}

function extractDetails(html) {
  const details = {};
  const pattern = /<dt>(.*?)<\/dt>\s*<dd>(.*?)<\/dd>/gs;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').replace(':', '').trim().toLowerCase();
    const value = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key) details[key] = value;
  }
  return details;
}

async function scrapeLcPage(url, searchIsbn) {
  const { data: html } = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  // Verify ISBN in page (if provided)
  if (searchIsbn) {
    const clean = searchIsbn.replace(/[-\s]/g, '');
    const pageHasIsbn = html.replace(/[-\s]/g, '').includes(clean);
    if (!pageHasIsbn) return null; // Wrong book, skip
  }

  const jsonld = extractJSONLD(html);
  const details = extractDetails(html);
  const result = {};

  if (jsonld) {
    result.title = jsonld.name || '';
    result.pages = jsonld.numberOfPages || null;
    result.language = jsonld.inLanguage || '';
    result.publishDate = jsonld.datePublished || '';
    result.imageUrl = jsonld.image || '';
    if (jsonld.author) {
      const authors = Array.isArray(jsonld.author) ? jsonld.author : [jsonld.author];
      result.author = authors.map(a => a.name).join(', ');
    }
    if (jsonld.aggregateRating) {
      const r = jsonld.aggregateRating;
      result.rating = parseFloat((r.ratingValue || '0').replace(',', '.'));
      result.ratingCount = r.ratingCount || null;
    }
    if (jsonld.isPartOfSeries) {
      result.series = jsonld.isPartOfSeries.name || '';
      result.volume = jsonld.isPartOfSeries.position || null;
    }
  }

  const pubMatch = html.match(/data-ga-book-publishers="([^"]*)"/);
  if (pubMatch) result.publisher = pubMatch[1];

  const catMatch = html.match(/data-ga-book-category="([^"]*)"/);
  if (catMatch) result.category = catMatch[1];

  result.format = details['format'] || '';
  result.originalTitle = details['tytuł oryginału'] || '';
  result.translator = details['tłumacz'] || '';

  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/);
  result.summary = descMatch ? descMatch[1].replace(/&hellip;$/, '…') : '';

  result.url = url;
  return result;
}

// ─── Szukamksiążki.pl ───
async function findSzukamksiazkiUrl(isbn) {
  const clean = isbn.replace(/[-\s]/g, '');
  const cacheKey = `sk_url:${clean}`;
  if (urlCache.has(cacheKey)) return urlCache.get(cacheKey);

  // Try with cleaned ISBN
  const formats = [
    clean,
    clean.replace(/(\d{3})(\d{1,5})(\d{1,7})(\d)/, '$1-$2-$3-$4'),
  ];

  for (const fmt of [...new Set(formats)]) {
    try {
      const url = `https://xn--szukamksiki-4kb16m.pl/SkNewWeb/search?isbn=${encodeURIComponent(fmt)}&sekcja=k`;
      const { data: html } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' },
      });
      const links = [...html.matchAll(/href="(\/SkNewWeb\/record\/\d+\/\d+)"/g)];
      if (links.length > 0) {
        const found = `https://xn--szukamksiki-4kb16m.pl${links[0][1]}`;
        urlCache.set(cacheKey, found);
        return found;
      }
    } catch (e) { /* skip */ }
  }

  urlCache.set(cacheKey, null);
  return null;
}

function parseSzukamksiazkiHtml(html) {
  const result = {};

  const getField = (label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `<div class="col-2 f_raleway_M text-right">\\s*${escaped}\\s*</div>\\s*<div class="col-10 f_raleway_SB">\\s*([\\s\\S]*?)\\s*</div>`
    );
    const m = html.match(pattern);
    return m ? m[1].trim() : '';
  };

  const titleMatch = html.match(/<h3[^>]*class="card-title[^"]*"[^>]*>\s*([^<]+)\s*<\/h3>/);
  result.title = titleMatch ? titleMatch[1].trim() : getField('Tytuł');

  const rawAuthor = getField('Autor');
  if (rawAuthor) {
    const parts = rawAuthor.split(',').map(p => p.trim().replace(/\.$/, ''));
    if (parts.length >= 2 && !/\d{4}/.test(parts[0]) && !/\d{4}/.test(parts[1])) {
      result.author = `${parts[1]} ${parts[0]}`;
    } else {
      result.author = parts[0] || rawAuthor;
    }
  }

  const rawIsbn = getField('ISBN');
  if (rawIsbn) {
    const isbnMatch = rawIsbn.match(/(\d{3}[-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d)/);
    result.isbn = isbnMatch ? isbnMatch[1].replace(/[-\s]/g, '') : '';
  }

  const rawPub = getField('Wydawnictwo');
  if (rawPub) {
    result.publisher = rawPub.replace(/Wydawnictwo\s*/g, '').replace(/[,;]\s*$/, '').trim();
  }

  const rawYear = getField('Rok wydania');
  if (rawYear) {
    const yearMatch = rawYear.match(/(\d{4})/);
    result.publishDate = yearMatch ? yearMatch[1] : '';
  }

  const rawPages = getField('Objętość');
  if (rawPages) {
    const pageMatch = rawPages.match(/(\d+)/);
    result.pages = pageMatch ? parseInt(pageMatch[1]) : null;
  }

  const rawPlace = getField('Miejsce wydania');
  if (rawPlace) result.place = rawPlace;

  const rawSeries = getField('Seria');
  if (rawSeries) {
    const lines = rawSeries.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const volMatch = line.match(/([^;]+?)\s*;\s*(?:cz\.\s*)?(\d+)/);
      if (volMatch) {
        result.series = volMatch[1].trim();
        result.volume = parseInt(volMatch[2]);
        break;
      }
    }
    if (!result.series && lines.length > 0) {
      result.series = lines[0].replace(/[;]*$/, '').trim();
    }
  }

  const subjectLabels = ['Hasła przedmiotowe', 'Temat', 'Gatunek'];
  for (const label of subjectLabels) {
    const idx = html.indexOf(label);
    if (idx >= 0) {
      const section = html.substring(idx, idx + 1500);
      const subjects = [...section.matchAll(/<div class="col-10 f_raleway_SB">\s*([^<]+?)\s*<\/div>/g)];
      const names = subjects.map(m => m[1].trim()).filter(Boolean);
      if (names.length > 0) {
        result.category = names.slice(0, 5).join(', ');
        result.tags = names.join(', ');
        break;
      }
    }
  }

  const coverMatch = html.match(/<div[^>]*class="[^"]*card-img[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"/);
  if (coverMatch) {
    result.imageUrl = coverMatch[1].startsWith('//') ? 'https:' + coverMatch[1] : coverMatch[1];
  }

  return result;
}

// ─── Główna funkcja: OL → LC → SK ───
export async function scanByIsbn(isbn) {
  const logs = [];
  const cleanIsbn = isbn.replace(/[-\s]/g, '');
  if (cleanIsbn.length < 10) {
    logs.push('✗ Invalid ISBN: ' + isbn);
    return { data: null, error: 'Invalid ISBN', logs };
  }

  // Helper to push result
  const ok = (data, msg) => { logs.push(msg); return { data, logs }; };

  // KROK 1: OpenLibrary
  try {
    logs.push('🔍 OpenLibrary...');
    const olData = await lookupOpenLibrary(cleanIsbn);
    if (olData && olData.title) {
      logs.push('  ✓ Found: "' + olData.title + '"');

      // Spróbuj LC po tytule+autorze z OL
      try {
        logs.push('🔍 Lubimyczytac (by title+author)...');
        const lcUrl = await findLcUrl(cleanIsbn, olData.title, olData.author || '');
        if (lcUrl) {
          logs.push('  → LC page found, scraping...');
          const lcData = await scrapeLcPage(lcUrl, cleanIsbn);
          if (lcData && lcData.title) {
            logs.push('  ✓ Description: ' + (lcData.summary ? 'yes' : 'no'));
            logs.push('  ✓ Rating: ' + (lcData.rating ? lcData.rating + '/10' : 'none'));
            logs.push('  ✓ Cover: ' + (lcData.imageUrl ? 'yes' : 'no'));
            return ok({
              title: lcData.title || olData.title,
              author: lcData.author || olData.author,
              publisher: lcData.publisher || olData.publisher || '',
              publishDate: lcData.publishDate || olData.publishDate || '',
              pages: lcData.pages ?? olData.pages ?? null,
              summary: lcData.summary || '',
              isbn: cleanIsbn,
              imageUrl: lcData.imageUrl || '',
              rating: lcData.rating ?? null,
              ratingCount: lcData.ratingCount ?? null,
              language: lcData.language || '',
              format: lcData.format || '',
              series: lcData.series || '',
              volume: lcData.volume ?? null,
              originalTitle: lcData.originalTitle || '',
              translator: lcData.translator || '',
              category: lcData.category || '',
              place: '',
              itemUrl: lcData.url || '',
              source: 'lubimyczytac',
              genres: lcData.category || '',
              tags: '',
            }, '✓ Source: LC (via OL)');
          }
        }
      } catch (e) { logs.push('  ✗ LC error: ' + e.message); }
      logs.push('  → LC not found, fallback OL');
      return ok({
        title: olData.title, author: olData.author || '',
        publisher: olData.publisher || '', publishDate: olData.publishDate || '',
        pages: olData.pages ?? null, summary: '',
        isbn: cleanIsbn, imageUrl: '',
        rating: null, ratingCount: null,
        language: '', format: '', series: '', volume: null,
        originalTitle: '', translator: '', category: '', place: '',
        itemUrl: '', source: 'openlibrary', genres: '', tags: '',
      }, '✓ Source: OL (basic only)');
    }
  } catch (e) { logs.push('✗ OL error: ' + e.message); }
  logs.push('✗ OL: not found');

  // KROK 2: LC by ISBN
  try {
    logs.push('🔍 Lubimyczytac (by ISBN)...');
    const lcUrl = await findLcUrl(cleanIsbn, '', '');
    if (lcUrl) {
      logs.push('  → LC page found, scraping...');
      const lcData = await scrapeLcPage(lcUrl, cleanIsbn);
      if (lcData && lcData.title) {
        logs.push('  ✓ Description: ' + (lcData.summary ? 'yes' : 'no'));
        logs.push('  ✓ Rating: ' + (lcData.rating ? lcData.rating + '/10' : 'none'));
        return ok({
          title: lcData.title, author: lcData.author || '',
          publisher: lcData.publisher || '', publishDate: lcData.publishDate || '',
          pages: lcData.pages ?? null, summary: lcData.summary || '',
          isbn: cleanIsbn, imageUrl: lcData.imageUrl || '',
          rating: lcData.rating ?? null, ratingCount: lcData.ratingCount ?? null,
          language: lcData.language || '', format: lcData.format || '',
          series: lcData.series || '', volume: lcData.volume ?? null,
          originalTitle: lcData.originalTitle || '', translator: lcData.translator || '',
          category: lcData.category || '', place: '',
          itemUrl: lcData.url || '', source: 'lubimyczytac',
          genres: lcData.category || '', tags: '',
        }, '✓ Source: LC (direct ISBN)');
      }
    }
  } catch (e) { logs.push('✗ LC error: ' + e.message); }
  logs.push('✗ LC: not found');

  // KROK 3: SK
  try {
    logs.push('🔍 Szukamksiążki...');
    const skUrl = await findSzukamksiazkiUrl(cleanIsbn);
    if (skUrl) {
      logs.push('  → SK page found, scraping...');
      const { data: skHtml } = await axios.get(skUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const skData = parseSzukamksiazkiHtml(skHtml);
      if (skData && skData.title) {
        logs.push('  ✓ Found: "' + skData.title + '"');
        logs.push('  ✓ Publisher: ' + (skData.publisher || '?'));
        logs.push('  ✓ Year: ' + (skData.publishDate || '?'));
        logs.push('  ✓ Pages: ' + (skData.pages || '?'));

        // KROK 4: LC by title from SK (opening, rating, cover)
        try {
          logs.push('🔍 LC (by title from SK)...');
          const lcUrl2 = await findLcUrl('', skData.title, skData.author || '');
          if (lcUrl2) {
            logs.push('  → LC page found, scraping...');
            const lcFromTitle = await scrapeLcPage(lcUrl2, '');
            if (lcFromTitle) {
              logs.push('  ✓ Description: ' + (lcFromTitle.summary ? 'yes' : 'no'));
              logs.push('  ✓ Rating: ' + (lcFromTitle.rating ? lcFromTitle.rating + '/10' : 'none'));
              logs.push('  ✓ Series: ' + (lcFromTitle.series || lcFromTitle.series || 'none'));
              return ok({
                title: skData.title, author: skData.author || '',
                publisher: skData.publisher || '', publishDate: skData.publishDate || '',
                pages: skData.pages ?? null,
                summary: lcFromTitle.summary || '',
                isbn: cleanIsbn,
                imageUrl: lcFromTitle.imageUrl || skData.imageUrl || '',
                rating: lcFromTitle.rating ?? null,
                ratingCount: lcFromTitle.ratingCount ?? null,
                language: lcFromTitle.language || '',
                format: lcFromTitle.format || '',
                series: lcFromTitle.series || skData.series || '',
                volume: lcFromTitle.volume ?? skData.volume ?? null,
                originalTitle: lcFromTitle.originalTitle || '',
                translator: lcFromTitle.translator || '',
                category: skData.category || lcFromTitle.category || '',
                place: skData.place || '',
                itemUrl: skData.url || '',
                source: 'szukamksiazki+lc',
                genres: skData.category || lcFromTitle.category || '',
                tags: skData.tags || '',
              }, '✓ Source: SK + LC (description, rating, cover)');
            }
          }
        } catch (e) { logs.push('  ✗ LC by title error: ' + e.message); }
        logs.push('  → LC not found by title, returning SK only');
        return ok({
          title: skData.title, author: skData.author || '',
          publisher: skData.publisher || '', publishDate: skData.publishDate || '',
          pages: skData.pages ?? null, summary: '',
          isbn: cleanIsbn, imageUrl: skData.imageUrl || '',
          rating: null, ratingCount: null,
          language: '', format: '',
          series: skData.series || '', volume: skData.volume ?? null,
          originalTitle: '', translator: '',
          category: skData.category || '', place: skData.place || '',
          itemUrl: skData.url || '', source: 'szukamksiazki',
          genres: skData.category || '', tags: skData.tags || '',
        }, '✓ Source: SK (basic only)');
      }
    }
  } catch (e) { logs.push('✗ SK error: ' + e.message); }
  logs.push('✗ SK: not found');

  // Fallback: OpenLibrary (jeszcze raz, na wszelki wypadek)
  try {
    const olData = await lookupOpenLibrary(cleanIsbn);
    if (olData && olData.title) {
      logs.push('  → Fallback OL: found "' + olData.title + '"');
      return ok({
        title: olData.title, author: olData.author || '',
        publisher: olData.publisher || '', publishDate: olData.publishDate || '',
        pages: olData.pages ?? null, summary: '',
        isbn: cleanIsbn, imageUrl: '', rating: null, ratingCount: null,
        language: '', format: '', series: '', volume: null,
        originalTitle: '', translator: '', category: '', place: '',
        itemUrl: '', source: 'openlibrary', genres: '', tags: '',
      }, '✓ Source: OL (last resort)');
    }
  } catch (e) {}

  logs.push('✗ All sources exhausted');
  return { data: null, error: 'Book not found in any source', logs };
}
