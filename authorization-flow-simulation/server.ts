// authServer.ts
import express from "express";
import authorizeRouter from "./routes/authorize";
import tokenRouter from "./routes/token";

const app = express();

app.use(express.json());

app.use("/authorize", authorizeRouter);
app.use("/token", tokenRouter);


const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Authorization server running on http://localhost:${PORT}`);
  console.log("GET /authorize to initiate the OAuth 2.0 authorization code flow");
  console.log("POST /token to exchange code for an access token");
});