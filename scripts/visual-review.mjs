import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
await page.goto(process.env.E2E_URL ?? 'http://127.0.0.1:3039');
await page.screenshot({ path: 'artifacts/welcome-desktop.png', fullPage: true });
const countries = JSON.parse(readFileSync('data/countries.json', 'utf8'));
const assets = JSON.parse(readFileSync('data/assets.json', 'utf8'));
await page.setContent(
  `<html><body style="margin:20px;background:#f7f7ef;font:14px Arial"><h1>Country silhouette review — all eligible countries</h1><div style="display:grid;grid-template-columns:repeat(8,1fr);gap:12px">${countries
    .filter((c) => c.shapeEligible)
    .map(
      (c) =>
        `<div style="text-align:center;border:1px solid #ddd;padding:5px">${assets[c.code].shape}<p>${c.name}</p></div>`,
    )
    .join('')}</div></body></html>`,
);
await page.screenshot({ path: 'artifacts/shapes-review.png', fullPage: true });
await browser.close();
