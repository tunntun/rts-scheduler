import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Setup view engine
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// Serve static files
app.use(express.static(__dirname));

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`RTS Server running at http://localhost:${PORT}`);
});