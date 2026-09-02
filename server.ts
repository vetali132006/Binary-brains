import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      geminiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }
  return geminiClient;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// AI Deep Diagnostic Endpoint
app.post('/api/gemini/diagnose', async (req, res) => {
  try {
    const { mode, focusTopic } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      // Fallback deterministic diagnostic report if key is not yet set
      return res.json({
        report: {
          rootCauseSummary: "A critical state desynchronization bug was introduced during the L2 application release on Aug 15. While the backend cart service returned HTTP 200 and persisted items to Redis/DB session storage, a frontend state serialization schema mismatch (camelCase vs snake_case or missing React Query invalidate/re-render hook) caused the cart UI drawer to remain empty.",
          systemFailureChain: [
            "1. User adds item -> Frontend sends POST /api/cart/items",
            "2. Backend successfully commits item & reserves dark-store inventory stock lock",
            "3. Response payload format mismatch causes UI state store (Zustand/Redux) to silently fail parsing",
            "4. UI shows 'Cart is Empty' (0 items) despite backend holding reservations",
            "5. Frustrated user clicks 'Add to Cart' 4-8 times consecutively, exhausting warehouse reservation pools",
            "6. Dark store marks high-velocity SKUs (P013 Instant Noodles, P014 Cereal, P006 Wheat Flour) as 'Out of Stock'",
            "7. User abandons session -> Completed orders plummet -64.8%, support tickets surge +450%",
            "8. Recommendation engine ingested click spam, boosting out-of-stock items in user feeds"
          ],
          productImpactAnalysis: "High-frequency staples (P013, P014, P005, P006, P030) suffered the highest disruption index. Phantom reservations artificially exhausted stock levels, blocking authentic purchases across 8 cities in Maharashtra.",
          segmentVulnerability: "The Family Segment was impacted disproportionately (-74.2% drop) because family orders average 5+ items per basket; a single invisible item breaks basket validation. Premium customers abandoned after 2 failed clicks, migrating to competitor apps.",
          demandForecastModel: "True consumer demand can be recovered by applying a temporal de-duplication heuristic (merging identical SKU cart events within 180-second sliding windows) to eliminate phantom retry inflation.",
          actionPlan: [
            {
              phase: "Immediate Containment (0 - 2 Hours)",
              timeline: "T+0h",
              actions: [
                "Hotfix frontend state deserializer to handle both camelCase and snake_case cart payloads.",
                "Flush uncommitted Redis cart inventory hold locks with TTL > 15 minutes to restore warehouse stock.",
                "Deploy client fallback polling on cart drawer open."
              ]
            },
            {
              phase: "Recommendation Model Purge (2 - 12 Hours)",
              timeline: "T+6h",
              actions: [
                "Filter out sessions containing >3 duplicate add events within 60s from collaborative filtering training datasets.",
                "Re-index recommendation catalog to prioritize currently confirmed in-stock essentials."
              ]
            },
            {
              phase: "Customer Retention & Winback (12 - 48 Hours)",
              timeline: "T+24h",
              actions: [
                "Send push notifications to affected L2 session users: 'Your basket has been recovered with ₹100 apology credit'.",
                "Prioritize Family segment accounts with instant free delivery vouchers."
              ]
            }
          ],
          sqlRemediationQuery: `-- 1. Identify phantom inventory locks\nSELECT product_id, COUNT(*) as ghost_holds, SUM(quantity) as locked_units\nFROM cart_reservations\nWHERE session_id LIKE 'L2-%'\n  AND status = 'PENDING'\n  AND created_at >= '2026-08-15'\n  AND order_id IS NULL\nGROUP BY product_id\nORDER BY locked_units DESC;\n\n-- 2. Release ghost locks older than 15 minutes\nUPDATE inventory_locks\nSET status = 'RELEASED', released_reason = 'UI_DESYNC_HOTFIX'\nWHERE session_id LIKE 'L2-%' AND status = 'HELD' AND updated_at < NOW() - INTERVAL '15 MINUTE';`
        }
      });
    }

    const prompt = `You are the Principal Incident Commander and Quick-Commerce Data Architect for Clinkt (grocery platform).
Analyze the following disruption dataset facts:
- Incident: Cart UI Desynchronization Bug on L2 release (from Aug 15 to Sep 1).
- Symptoms: User adds item -> Backend confirms 200 OK -> UI Cart renders 0 items -> Completed orders drop ~65% -> Customer complaints up 450% -> High-interest products (Instant Noodles P013, Breakfast Cereal P014, Wheat Flour P006, Soap P030) show phantom stockouts due to ghost cart locks -> Recommendation relevance corrupted due to spam retry clicks.
- Focus: ${focusTopic || 'Comprehensive Root Cause, Product Disruptions, Demand Prediction, and Segment Vulnerabilities'}.

Return a structured JSON response with exact keys:
- rootCauseSummary: string
- systemFailureChain: array of strings
- productImpactAnalysis: string
- segmentVulnerability: string
- demandForecastModel: string
- actionPlan: array of { phase: string, timeline: string, actions: string[] }
- sqlRemediationQuery: string`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ report: parsed });
  } catch (error: any) {
    console.error('Gemini diagnose error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate diagnostic report' });
  }
});

// AI Chat Assistant / Query Endpoint
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { query, conversationHistory } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        reply: `**Analysis for: "${query}"**\n\n1. **Root Cause**: During the Aug 15 L2 release, backend confirmation succeeded but frontend state store failed to re-render.\n2. **Disrupted Products**: Staples like **P013 (Instant Noodles)**, **P014 (Cereal)**, and **P006 (Wheat Flour)** faced severe phantom stockouts.\n3. **Most Affected Segment**: **Family Segment** lost 74.2% of orders because multi-item orders failed completely.\n4. **Demand Prediction**: By filtering duplicate retry clicks (clicks < 60s apart), we recover authentic daily demand of ~115 units/day.`,
      });
    }

    const systemInstruction = `You are the Clinkt AI Incident Analyst and Data Science Advisor. You have full context on the Clinkt grocery dataset (200 customers across Pune, Mumbai, Navi Mumbai, Thane, Nashik, Kolhapur, Nagpur, Aurangabad; 36 products across Staples, Dairy, Packaged Foods, Beverages, Personal Care; 279 orders spanning Aug 1 to Sep 1, 2026).
Key incident context:
- Pre-bug baseline (Aug 1 - Aug 14): Normal order volume (122 orders), healthy cart conversions.
- Bug period (Aug 15 - Sep 1, L2 sessions): UI cart desync bug where added items didn't display in the cart UI, leading to repeated user clicks, inventory stock locks in Redis, order collapse (-64.8%), complaint spike (+450%), and flawed recommendation models.
Answer user questions analytically, providing specific numbers, product IDs, customer segment behaviors, and actionable solutions. Keep answers concise, authoritative, and formatted with markdown.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: `${query}`,
      config: {
        systemInstruction,
      },
    });

    res.json({ reply: response.text });
  } catch (error: any) {
    console.error('Gemini chat error:', error);
    res.status(500).json({ error: error.message || 'Failed to query Gemini' });
  }
});

// Simulate Live Cart Sync & Bug Reproduction
app.post('/api/simulate/cart-sync', (req, res) => {
  const { productId, bugEnabled, currentCart = [] } = req.body;
  
  // Backend ALWAYS saves the item successfully
  const updatedBackendCart = [...currentCart, {
    productId,
    quantity: 1,
    addedAt: new Date().toISOString(),
    backendConfirmed: true,
    reservationId: `RES-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
  }];

  if (bugEnabled) {
    // In bug mode: backend confirms HTTP 200, but returns legacy snake_case or nested payload that client UI drops
    return res.json({
      success: true,
      httpStatus: 200,
      backendStatus: 'ITEM_PERSISTED_IN_REDIS',
      backendCartCount: updatedBackendCart.length,
      backendCart: updatedBackendCart,
      // Buggy client payload (missing required UI key or nullified array)
      clientPayloadReceived: {
        status: 'OK',
        cart_data: {
          items_count: updatedBackendCart.length,
          // Intentionally omitting standard `items` array expected by React state hook
        }
      },
      uiRenderedItemsCount: 0,
      disruptionNote: 'Backend holds reservation lock, but UI state manager rendered 0 items.',
    });
  } else {
    // In hotfixed mode: optimistic update and matching schema
    return res.json({
      success: true,
      httpStatus: 200,
      backendStatus: 'ITEM_PERSISTED_IN_REDIS',
      backendCartCount: updatedBackendCart.length,
      backendCart: updatedBackendCart,
      clientPayloadReceived: {
        status: 'OK',
        items: updatedBackendCart,
      },
      uiRenderedItemsCount: updatedBackendCart.length,
      disruptionNote: 'Hotfix active: UI and Backend cart state 100% synchronized in real time.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Clinkt Analytics Server running on http://localhost:${PORT}`);
  });
}

startServer();
