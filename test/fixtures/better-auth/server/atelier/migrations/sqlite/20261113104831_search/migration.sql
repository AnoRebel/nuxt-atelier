-- atelier:data search index
CREATE VIRTUAL TABLE IF NOT EXISTS atelier_search USING fts5(key UNINDEXED, type UNINDEXED, entry UNINDEXED, locale UNINDEXED, a, b, c, tokenize = 'unicode61 remove_diacritics 2');
