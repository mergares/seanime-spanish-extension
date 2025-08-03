import express from "express";
import morgan from "morgan";
import index from "../src/routes/app";
import providersList from "../src/routes/providers";
import helmet from "helmet";
import cors from 'cors'

/* Anime */
import flv from "../src/routes/v1/anime/animeflv/AnimeflvRoutes";
import latinhd from "../src/routes/v1/anime/animelatinohd/AnimeLatinoHDRoutes";
import gogoanime from "../src/routes/v1/anime/gogoanime/GogoAnimeRoute";
import zoro from "../src/routes/v1/anime/zoro/ZoroRoutes";
import monoschinos from "../src/routes/v1/anime/monoschinos/MonosChinosRoute";
import tioanime from '../src/routes/v1/anime/tioanime/TioAnimeRoute'
import jimov from '../src/routes/v1/anime/jimov/JimovRoutes';
import WcoStream from "../src/routes/v1/anime/wcostream/wcostreamRoutes";
import AnimeBlix from "../src/routes/v1/anime/animeblix/AnimeBlixRoutes";
import Animevostfr from "../src/routes/v1/anime/animevostfr/AnimevostfrRoutes";

/* Manga */
import comick from "../src/routes/v1/manga/comick/ComickRoutes";
import inmanga from "../src/routes/v1/manga/inmanga/InmangaRoutes";
import nhentai from "../src/routes/v1/manga/nhentai/NhentaiRoutes"
import mangareader from "../src/routes/v1/manga/mangareader/MangaReaderRoutes";
import manganelo from "../src/routes/v1/manga/manganelo/ManganeloRoutes";

const app = express();
const port = process.env.PORT || 3003;

app.use(index);
app.use(providersList);
//config
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));
app.use(helmet());
app.use(cors())

// Add axios for Monoschinos API calls
import axios from 'axios';

// Similarity search functions
function calculateExactMatchScore(query: string, title: string): number {
  if (query === title) return 1.0;
  if (title.includes(query) || query.includes(title)) return 0.9;
  return 0.0;
}

function calculateWordMatchScore(queryWords: string[], titleWords: string[]): number {
  if (queryWords.length === 0 || titleWords.length === 0) return 0.0;
  
  const matchingWords = queryWords.filter(word => 
    titleWords.some(titleWord => titleWord.includes(word) || word.includes(titleWord))
  );
  
  return matchingWords.length / Math.max(queryWords.length, titleWords.length);
}

function calculateLevenshteinScore(query: string, title: string): number {
  const distance = levenshteinDistance(query, title);
  const maxLength = Math.max(query.length, title.length);
  
  if (maxLength === 0) return 1.0;
  
  return 1 - (distance / maxLength);
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }
  
  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

function findSimilarAnime(query: string, animeList: any[], limit: number): any[] {
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);
  
  const scoredResults = animeList.map(anime => {
    const title = (anime.title || anime.name || '').toLowerCase();
    const titleWords = title.split(/\s+/);
    
    // Calculate multiple similarity scores
    const exactMatchScore = calculateExactMatchScore(queryLower, title);
    const wordMatchScore = calculateWordMatchScore(queryWords, titleWords);
    const levenshteinScore = calculateLevenshteinScore(queryLower, title);
    
    // Weighted combination of scores
    const totalScore = (
      exactMatchScore * 0.5 +
      wordMatchScore * 0.3 +
      levenshteinScore * 0.2
    );
    
    return {
      ...anime,
      similarity: totalScore
    };
  });

  // Sort by similarity score (highest first) and return top results
  return scoredResults
    .filter(result => result.similarity > 0.1) // Only return results with some similarity
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, limit);
}

//routes

/*anime*/
app.use(flv);
app.use(latinhd);
app.use(gogoanime);
app.use(monoschinos);
app.use(zoro);
app.use(tioanime)
// jimov route removed - implementing search directly
app.use(WcoStream);
app.use(AnimeBlix);
app.use(Animevostfr);

/* anime */


/*Manga*/
app.use(comick);
app.use(inmanga);
app.use(nhentai)
app.use(mangareader);
app.use(manganelo);
/*Manga*/

// Jimov API Routes with Search and Similarity
app.get('/api/search', async (req, res) => {
  try {
    const { q: query, limit = 24, page = 1 } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: "Query parameter 'q' is required"
      });
    }

    // First, try to get exact matches from Monoschinos
    const exactMatches = await searchMonoschinos(query, {
      limit: parseInt(limit as string),
      page: parseInt(page as string)
    });
    
    if (exactMatches.length > 0) {
      const results = exactMatches.map(anime => ({
        ...anime,
        similarity: 1.0 // Exact match
      }));

      return res.json({
        success: true,
        data: results,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: results.length
        }
      });
    }

    // If no exact matches, get popular anime and find similar ones
    const popularAnime = await getPopularAnime();
    const similarResults = findSimilarAnime(query, popularAnime, parseInt(limit as string));
    
    res.json({
      success: true,
      data: similarResults,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: similarResults.length
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: "Internal server error during search"
    });
  }
});

app.get('/api/anime/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        error: "Anime ID is required"
      });
    }

    const anime = await getAnimeDetails(id);
    
    if (!anime) {
      return res.status(404).json({
        error: "Anime not found"
      });
    }

    res.json({
      success: true,
      data: anime
    });

  } catch (error) {
    console.error('Get anime details error:', error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

app.get('/api/anime/:id/episodes', async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'sub' } = req.query;
    
    if (!id) {
      return res.status(400).json({
        error: "Anime ID is required"
      });
    }

    const episodes = await getEpisodes(id, type as string);
    
    res.json({
      success: true,
      episodes: episodes
    });

  } catch (error) {
    console.error('Get episodes error:', error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

app.get('/api/anime/:id/episode/:episodeNumber/sources', async (req, res) => {
  try {
    const { id, episodeNumber } = req.params;
    const { type = 'sub', server = 'monoschinos' } = req.query;
    
    if (!id || !episodeNumber) {
      return res.status(400).json({
        error: "Anime ID and episode number are required"
      });
    }

    const sources = await getSources(id, parseInt(episodeNumber), {
      type: type as string,
      server: server as string
    });
    
    res.json({
      success: true,
      sources: sources.sources,
      subtitles: sources.subtitles
    });

  } catch (error) {
    console.error('Get sources error:', error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// Serve manifest.json for Seanime
app.get('/manifest.json', (req, res) => {
  res.json({
    "id": "jimov",
    "name": "Jimov",
    "version": "1.0.0",
    "manifestURI": "http://localhost:3003/manifest.json",
    "language": "typescript",
    "type": "onlinestream-provider",
    "description": "Jimov is an online stream provider for anime with both sub and dub support, powered by Monoschinos implementation.",
    "author": "Your Name",
    "icon": "https://raw.githubusercontent.com/your-username/seanime-extensions/main/jimov/logo.png",
    "website": "https://jimov.ren.com",
    "lang": "en",
    "payload": "/// <reference path=\"./online-streaming-provider.d.ts\" />\n\nclass Provider {\n  private baseUrl = \"http://localhost:3003\";\n  private apiUrl = \"http://localhost:3003/api\";\n\n  getSettings(): Settings {\n    return {\n      episodeServers: [\"Monoschinos\", \"Monoschinos-2\", \"Monoschinos-3\"],\n      supportsDub: true,\n    };\n  }\n\n  async search(query: SearchOptions): Promise<SearchResult[]> {\n    try {\n      const res = await fetch(\n        `${this.apiUrl}/search?q=${encodeURIComponent(query.query)}&limit=24&page=1`,\n        {\n          headers: {\n            \"User-Agent\": \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\",\n            \"Accept\": \"application/json\",\n            \"Referer\": this.baseUrl + \"/\",\n            \"Origin\": this.baseUrl,\n            \"Content-Type\": \"application/json\",\n          },\n        }\n      );\n    \n      if (!res.ok) {\n        throw new Error(`Search request failed: ${res.status}`);\n      }\n    \n      const json = await res.json();\n      const results: SearchResult[] = [];\n    \n      const animeList = json?.data || json?.results || json?.anime || [];\n    \n      for (const anime of animeList) {\n        const hasDub = anime.hasDub || anime.dub_available || false;\n        const subOrDub: SubOrDub = query.dub ? \"dub\" : \"sub\";\n    \n        if (query.dub && !hasDub) continue;\n    \n        results.push({\n          id: `${anime.id || anime.mal_id}/${subOrDub}`,\n          title: anime.title || anime.name,\n          url: `${this.baseUrl}/anime/${anime.slug || anime.id}`,\n          subOrDub,\n        });\n      }\n    \n      return results;\n    } catch (error) {\n      console.error('Search error:', error);\n      return [];\n    }\n  }\n\n  async findEpisodes(Id: string): Promise<Episode[]> {\n    try {\n      const [id, lang] = Id.split(\"/\");\n      const subOrDub: SubOrDub = lang === \"dub\" ? \"dub\" : \"sub\";\n\n      const epRes = await fetch(\n        `${this.apiUrl}/anime/${id}/episodes?type=${subOrDub}`,\n        {\n          headers: {\n            \"User-Agent\": \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\",\n            \"Accept\": \"application/json\",\n            \"Referer\": this.baseUrl + \"/\",\n            \"Origin\": this.baseUrl,\n            \"Content-Type\": \"application/json\",\n          },\n        }\n      );\n\n      if (!epRes.ok) {\n        throw new Error(`Episode request failed: ${epRes.status}`);\n      }\n\n      const epJson = await epRes.json();\n      const episodes: Episode[] = [];\n\n      const episodeList = epJson?.episodes || epJson?.data || epJson?.results || [];\n\n      for (const ep of episodeList) {\n        episodes.push({\n          id: `${id}/${subOrDub}`,\n          number: ep.number || ep.episode_number,\n          title: ep.title || `Episode ${ep.number || ep.episode_number}`,\n          url: \"\",\n        });\n      }\n\n      return episodes;\n    } catch (error) {\n      console.error('Find episodes error:', error);\n      return [];\n    }\n  }\n\n  async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {\n    try {\n      const [id, subOrDubRaw] = episode.id.split(\"/\");\n      const subOrDub: SubOrDub = subOrDubRaw === \"dub\" ? \"dub\" : \"sub\";\n    \n      const serverMap: Record<string, string> = {\n        \"Monoschinos\": \"monoschinos\",\n        \"Monoschinos-2\": \"monoschinos2\",\n        \"Monoschinos-3\": \"monoschinos3\",\n      };\n    \n      const serverType = serverMap[_server] || \"monoschinos\";\n    \n      const sourcesUrl = `${this.apiUrl}/anime/${id}/episode/${episode.number}/sources?type=${subOrDub}&server=${serverType}`;\n    \n      const res = await fetch(sourcesUrl, {\n        headers: {\n          \"User-Agent\": \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\",\n          \"Accept\": \"application/json\",\n          \"Referer\": this.baseUrl + \"/\",\n          \"Origin\": this.baseUrl,\n          \"Content-Type\": \"application/json\",\n        },\n      });\n\n      if (!res.ok) {\n        throw new Error(`Sources request failed: ${res.status}`);\n      }\n  \n      const json = await res.json();\n      const sources = json?.sources || json?.data || [];\n  \n      if (!sources.length) throw new Error(\"No video sources found\");\n  \n      const streamSource = sources.find((s: any) => s.type === \"hls\") ||\n                           sources.find((s: any) => s.type === \"mp4\") ||\n                           sources[0];\n  \n      if (!streamSource?.url && !streamSource?.file) throw new Error(\"No valid stream file found\");\n  \n      const subtitleTracks = json?.subtitles || json?.tracks || [];\n      const subtitles = subtitleTracks\n        .filter((track: any) => track.kind === \"captions\" || track.type === \"subtitle\")\n        .map((track: any, index: number) => ({\n          id: `sub-${index}`,\n          language: track.label || track.language || \"Unknown\",\n          url: track.url || track.file,\n          isDefault: !!track.default,\n        }));\n  \n      return {\n        server: _server,\n        headers: {\n          \"Access-Control-Allow-Origin\": \"*\",\n          \"Access-Control-Allow-Headers\": \"*\",\n          \"Access-Control-Allow-Methods\": \"*\",\n          \"Referer\": this.baseUrl,\n        },\n        videoSources: [\n          {\n            url: streamSource.url || streamSource.file,\n            type: streamSource.type || \"hls\",\n            quality: streamSource.quality || \"auto\",\n            subtitles,\n          },\n        ],\n      };\n    } catch (err) {\n      console.warn(`Failed on ${_server}`, err);\n      throw new Error(`No stream found for ${_server}`);\n    }\n  }\n}"
  });
});

// Monoschinos API helper functions
async function searchMonoschinos(query: string, options: { limit: number; page: number }): Promise<any[]> {
  try {
    const response = await axios.get('https://monoschinos2.com/api/search', {
      params: {
        q: query,
        limit: options.limit,
        page: options.page
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://monoschinos2.com',
        'Origin': 'https://monoschinos2.com'
      },
      timeout: 10000
    });

    if (response.data && response.data.success) {
      return response.data.data || [];
    }

    return [];

  } catch (error) {
    console.error('Monoschinos search error:', error);
    return [];
  }
}

async function getPopularAnime(): Promise<any[]> {
  try {
    const response = await axios.get('https://monoschinos2.com/api/anime/popular', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://monoschinos2.com',
        'Origin': 'https://monoschinos2.com'
      },
      timeout: 10000
    });

    if (response.data && response.data.success) {
      return response.data.data || [];
    }

    return [];

  } catch (error) {
    console.error('Get popular anime error:', error);
    return [];
  }
}

async function getAnimeDetails(id: string): Promise<any | null> {
  try {
    const response = await axios.get(`https://monoschinos2.com/api/anime/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://monoschinos2.com',
        'Origin': 'https://monoschinos2.com'
      },
      timeout: 10000
    });

    if (response.data && response.data.success) {
      return response.data.data;
    }

    return null;

  } catch (error) {
    console.error('Get anime details error:', error);
    return null;
  }
}

async function getEpisodes(id: string, type: string): Promise<any[]> {
  try {
    const response = await axios.get(`https://monoschinos2.com/api/anime/${id}/episodes`, {
      params: { type },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://monoschinos2.com',
        'Origin': 'https://monoschinos2.com'
      },
      timeout: 10000
    });

    if (response.data && response.data.success) {
      return response.data.episodes || [];
    }

    return [];

  } catch (error) {
    console.error('Get episodes error:', error);
    return [];
  }
}

async function getSources(id: string, episodeNumber: number, options: { type: string; server: string }): Promise<{ sources: any[]; subtitles: any[] }> {
  try {
    const response = await axios.get(`https://monoschinos2.com/api/anime/${id}/episode/${episodeNumber}/sources`, {
      params: {
        type: options.type,
        server: options.server
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://monoschinos2.com',
        'Origin': 'https://monoschinos2.com'
      },
      timeout: 15000
    });

    if (response.data && response.data.success) {
      return {
        sources: response.data.sources || [],
        subtitles: response.data.subtitles || []
      };
    }

    return { sources: [], subtitles: [] };

  } catch (error) {
    console.error('Get sources error:', error);
    return { sources: [], subtitles: [] };
  }
}

/*error */

interface ErrorResponse {
  error: {
    message: string;
    status: number;
  };
}

app.use((err, res, _next) => {
  //console.log(err.statusCode);
  let response: ErrorResponse;
  switch (err.statusCode) {
    case 500:
      response = {
        error: {
          message: "An internal server error occurred",
          status: 500,
        },
      };
      break;
    case 400:
      response = {
        error: {
          message: "There was an error with the request parameters",
          status: 400,
        },
      };
      break;
    default:
      response = {
        error: {
          message: "The requested resource was not found",
          status: 404,
        },
      };
      break;
  }
  res.status(response.error.status).send(response);
});


app.listen(port, () => {
  console.log(`Servidor iniciado en el puerto ${port} listo para trabajar :)`);
});

module.exports = app;
