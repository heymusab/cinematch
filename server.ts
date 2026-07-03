import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";

dotenv.config({ path: ".env.local" });
dotenv.config();


const TMDB_BASE_URL = "https://api.themoviedb.org/3";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Database models
  interface DBUser {
    id: string;
    name: string;
    email: string;
    salt: string;
    hash: string;
    favorites: number[];
    watchlist: number[];
  }

  const USERS_DB_PATH = path.join(process.cwd(), "users.json");

  function readUsersDB(): DBUser[] {
    try {
      if (!fs.existsSync(USERS_DB_PATH)) {
        fs.writeFileSync(USERS_DB_PATH, JSON.stringify([]));
        return [];
      }
      const data = fs.readFileSync(USERS_DB_PATH, "utf8");
      return JSON.parse(data || "[]");
    } catch (err) {
      console.error("Failed to read users database:", err);
      return [];
    }
  }

  function writeUsersDB(users: DBUser[]) {
    try {
      fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2));
    } catch (err) {
      console.error("Failed to write to users database:", err);
    }
  }

  function hashPassword(password: string): { salt: string; hash: string } {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return { salt, hash };
  }

  function verifyPassword(password: string, salt: string, hash: string): boolean {
    const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return hash === checkHash;
  }

  // Register Endpoint
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      const db = readUsersDB();
      
      if (db.find(u => u.email === normalizedEmail)) {
        return res.status(400).json({ error: "Email is already registered" });
      }
      
      const { salt, hash } = hashPassword(password);
      const newUser: DBUser = {
        id: crypto.randomBytes(8).toString("hex"),
        name: name.trim(),
        email: normalizedEmail,
        salt,
        hash,
        favorites: [],
        watchlist: []
      };
      
      db.push(newUser);
      writeUsersDB(db);
      
      const token = crypto.randomBytes(24).toString("hex");
      res.json({
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          favorites: newUser.favorites,
          watchlist: newUser.watchlist,
          token
        }
      });
    } catch (err: any) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Login Endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      const db = readUsersDB();
      const user = db.find(u => u.email === normalizedEmail);
      
      if (!user || !verifyPassword(password, user.salt, user.hash)) {
        return res.status(400).json({ error: "Invalid email or password" });
      }
      
      const token = crypto.randomBytes(24).toString("hex");
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          favorites: user.favorites,
          watchlist: user.watchlist,
          token
        }
      });
    } catch (err: any) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Sync Endpoint
  app.post("/api/user/sync", async (req, res) => {
    try {
      const { email, favorites, watchlist } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required to sync" });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      const db = readUsersDB();
      const userIdx = db.findIndex(u => u.email === normalizedEmail);
      
      if (userIdx === -1) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (Array.isArray(favorites)) {
        db[userIdx].favorites = favorites;
      }
      if (Array.isArray(watchlist)) {
        db[userIdx].watchlist = watchlist;
      }
      
      writeUsersDB(db);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Sync error:", err);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  // Check TMDB Auth
  const getTMDBOptions = (req: express.Request) => {
    let tmdbKey = process.env.TMDB_API_KEY || "";
    tmdbKey = tmdbKey.trim().replace(/^["']|["']$/g, "");
    if (!tmdbKey) {
      throw new Error("TMDB_API_KEY is not set in environment variables");
    }
    if (tmdbKey.length === 32) {
      // v3 API Key (32-character hex) - pass as query parameter
      return {
        params: {
          api_key: tmdbKey
        },
        headers: {
          accept: 'application/json'
        }
      };
    } else {
      // v4 API Read Access Token - pass as Authorization Bearer header
      return {
        headers: {
          Authorization: `Bearer ${tmdbKey}`,
          accept: 'application/json'
        }
      };
    }
  };

  // Trending Movies Endpoint
  app.get("/api/movies/trending", async (req, res) => {
    try {
      const response = await axios.get(`${TMDB_BASE_URL}/trending/movie/day?language=en-US`, getTMDBOptions(req));
      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching trending movies:", error?.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch trending movies" });
    }
  });

  // Search Movies Endpoint
  app.get("/api/movies/search", async (req, res) => {
    try {
      const query = req.query.q;
      if (!query) return res.status(400).json({ error: "Query parameter 'q' is required" });
      const response = await axios.get(`${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(query as string)}&language=en-US&page=1`, getTMDBOptions(req));
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to search movies" });
    }
  });

  // Get Movie Details
  app.get("/api/movies/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const response = await axios.get(`${TMDB_BASE_URL}/movie/${id}?language=en-US&append_to_response=videos,credits,watch/providers`, getTMDBOptions(req));
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch movie details" });
    }
  });

  // Get TV Details
  app.get("/api/tv/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const response = await axios.get(`${TMDB_BASE_URL}/tv/${id}?language=en-US&append_to_response=videos,credits,watch/providers`, getTMDBOptions(req));
      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching TV details:", error?.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch TV details" });
    }
  });

  // Upcoming Movies Endpoint
  app.get("/api/movies/upcoming", async (req, res) => {
    try {
      const response = await axios.get(`${TMDB_BASE_URL}/movie/upcoming?language=en-US&page=1`, getTMDBOptions(req));
      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching upcoming movies:", error?.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch upcoming movies" });
    }
  });

  // Suggest Movies (Gemini + TMDB Hybrid)
  app.post("/api/suggest-movies", async (req, res) => {
    try {
      const { prompt, filters } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      let apiKey = process.env.GEMINI_API_KEY || "";
      apiKey = apiKey.trim().replace(/^["']|["']$/g, "");
      if (!apiKey) {
        console.error("GEMINI_API_KEY is not set.");
        return res.status(500).json({ error: "API key configuration missing." });
      }

      const ai = new GoogleGenAI({ apiKey });

      // Determine era constraint
      let eraInstruction = "prioritize modern movies released between 2000 and 2026.";
      if (filters?.era) {
        switch (filters.era) {
          case "2020-2026":
            eraInstruction = "strictly recommend movies released between 2020 and 2026.";
            break;
          case "2010s":
            eraInstruction = "strictly recommend movies released in the 2010s (2010-2019).";
            break;
          case "2000s":
            eraInstruction = "strictly recommend movies released in the 2000s (2000-2009).";
            break;
          case "90s":
            eraInstruction = "strictly recommend movies released in the 1990s (1990-1999).";
            break;
          case "80s-older":
            eraInstruction = "strictly recommend classic movies released in the 1980s or earlier (pre-1990).";
            break;
        }
      }

      // Determine language constraint
      let languageInstruction = "";
      if (filters?.language) {
        if (filters.language === "english") {
          languageInstruction = "Only recommend English language (Hollywood) films.";
        } else if (filters.language === "foreign") {
          languageInstruction = "Only recommend international or foreign-language films (non-English).";
        }
      }

      // Determine creativity/strictness instructions
      let strictnessInstruction = "Be creative but precise in your selections.";
      let temperature = 0.5; // default
      if (filters?.strictness) {
        if (filters.strictness === "high") {
          strictnessInstruction = "The recommendations must strictly and precisely match the user's criteria. Focus on direct relevance.";
          temperature = 0.2;
        } else if (filters.strictness === "creative") {
          strictnessInstruction = "Be creative, surprising, and open-minded in your selections, finding subtle or metaphorical matches.";
          temperature = 0.85;
        }
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Suggest exactly 8 fantastic recommendations (can be either feature films or TV shows/series/seasons) based on this user request: "${prompt}". ${eraInstruction} ${languageInstruction}`,
        config: {
          systemInstruction:
            `You are an expert movie and TV show recommender. You recommend standalone feature films or TV shows/series/seasons. ${eraInstruction} ${languageInstruction} Output ONLY a JSON array of exactly 8 recommendation objects. ${strictnessInstruction}`,
          temperature: temperature,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                year: { type: Type.STRING },
                genre: { type: Type.STRING },
                director: { type: Type.STRING, description: "Director for films, or Creator/Network for TV shows." },
                summary: {
                  type: Type.STRING,
                  description: "A concise, engaging 1-2 sentence plot summary.",
                },
                reason: {
                  type: Type.STRING,
                  description:
                    "Why this recommendation specifically fits the user's request, in 1-2 sentences.",
                },
                type: {
                  type: Type.STRING,
                  description: "The content type: 'movie' or 'tv'.",
                },
              },
              required: ["title", "year", "genre", "director", "summary", "reason", "type"],
            },
          },
        },
      });

      const jsonText = response.text;
      const aiMovies = JSON.parse(jsonText || "[]");
      
      // Enrich with TMDB Data
      const enrichedMovies = await Promise.all(
        aiMovies.map(async (movie: any) => {
          try {
            const isTv = movie.type === "tv";
            const searchPath = isTv ? "search/tv" : "search/movie";
            const tmdbRes = await axios.get(
              `${TMDB_BASE_URL}/${searchPath}?query=${encodeURIComponent(movie.title)}&language=en-US&page=1`,
              getTMDBOptions(req)
            );
            const tmdbMatch = tmdbRes.data.results?.[0];
            return {
              ...movie,
              title: tmdbMatch?.name || tmdbMatch?.title || movie.title,
              poster_path: tmdbMatch?.poster_path,
              backdrop_path: tmdbMatch?.backdrop_path,
              tmdb_id: tmdbMatch?.id,
              vote_average: tmdbMatch?.vote_average
            };
          } catch (e) {
            console.error(`Failed to enrich recommendation: ${movie.title}`);
            return movie;
          }
        })
      );
      
      res.json({ movies: enrichedMovies });
    } catch (error: any) {
      console.error("Error fetching movie suggestions:", error);
      const isHighDemand = error?.message?.includes("high demand") || error?.status === 503;
      const errorMessage = isHighDemand
        ? "Gemini is currently experiencing high demand. Please try again in a few seconds."
        : "Failed to fetch suggestions";
      res.status(isHighDemand ? 503 : 500).json({ error: errorMessage });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
