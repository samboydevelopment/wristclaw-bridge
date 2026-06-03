---
layout: default
title: Privacy Policy — WristClaw
description: Privacy policy for WristClaw, the iPhone and Apple Watch companion for a local WristClaw Bridge running on the user's Mac.
---

<style>
  :root {
    color-scheme: dark;
    --wc-bg: #090d14;
    --wc-panel: rgba(18, 24, 35, 0.78);
    --wc-panel-strong: rgba(24, 31, 44, 0.92);
    --wc-line: rgba(255, 255, 255, 0.11);
    --wc-text: #f7f9ff;
    --wc-muted: #b8c1d3;
    --wc-soft: #dbe3f2;
    --wc-red: #ff3148;
    --wc-cyan: #65d8ff;
  }

  body {
    background:
      radial-gradient(circle at 18% 78%, rgba(255, 49, 72, 0.18), transparent 34rem),
      radial-gradient(circle at 86% 18%, rgba(101, 216, 255, 0.15), transparent 30rem),
      linear-gradient(180deg, #0b1018 0%, #111722 100%) !important;
    color: var(--wc-text) !important;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif !important;
  }

  .wrapper {
    width: min(1080px, calc(100% - 40px)) !important;
    margin: 0 auto !important;
  }

  .wrapper > header,
  .wrapper > footer {
    display: none !important;
  }

  .wrapper > section {
    width: 100% !important;
    float: none !important;
    padding: 0 !important;
    border: 0 !important;
  }

  .privacy-page {
    padding: 56px 0 72px;
  }

  .privacy-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 56px;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    color: var(--wc-text) !important;
    font-weight: 760;
    letter-spacing: 0;
    text-decoration: none;
  }

  .brand-mark {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: linear-gradient(145deg, #ff4458, #e6002a);
    box-shadow: 0 10px 30px rgba(255, 49, 72, 0.26);
    display: inline-block;
    position: relative;
  }

  .brand-mark::before,
  .brand-mark::after {
    content: "";
    position: absolute;
    width: 5px;
    height: 16px;
    top: -9px;
    border-radius: 8px;
    background: #ff4458;
  }

  .brand-mark::before { left: 8px; transform: rotate(-28deg); }
  .brand-mark::after { right: 8px; transform: rotate(28deg); }

  .nav-links {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
  }

  .nav-links a,
  .policy-link {
    color: var(--wc-soft) !important;
    text-decoration: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.22);
  }

  .hero {
    padding: 54px;
    border: 1px solid var(--wc-line);
    border-radius: 32px;
    background:
      linear-gradient(135deg, rgba(255, 49, 72, 0.12), transparent 36%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.025));
    box-shadow: 0 28px 90px rgba(0, 0, 0, 0.32);
  }

  .eyebrow {
    margin: 0 0 18px;
    color: var(--wc-cyan);
    font-size: 14px;
    font-weight: 760;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  h1,
  h2,
  h3 {
    color: var(--wc-text) !important;
    border: 0 !important;
    letter-spacing: 0 !important;
  }

  h1 {
    max-width: 760px;
    margin: 0 0 20px !important;
    font-size: clamp(46px, 7vw, 82px) !important;
    line-height: 0.98 !important;
    font-weight: 820 !important;
  }

  .hero-copy {
    max-width: 760px;
    margin: 0 !important;
    color: var(--wc-muted) !important;
    font-size: 21px;
    line-height: 1.55;
  }

  .updated {
    margin-top: 30px;
    color: #8f99ad;
    font-size: 15px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    margin: 28px 0 34px;
  }

  .summary-card,
  .policy-section {
    border: 1px solid var(--wc-line);
    border-radius: 22px;
    background: var(--wc-panel);
    backdrop-filter: blur(18px);
  }

  .summary-card {
    padding: 24px;
  }

  .summary-card h2 {
    margin: 0 0 10px !important;
    font-size: 20px !important;
  }

  .summary-card p,
  .policy-section p,
  .policy-section li {
    color: var(--wc-muted) !important;
    font-size: 17px;
    line-height: 1.68;
  }

  .policy-section {
    padding: 34px;
    margin-top: 18px;
  }

  .policy-section h2 {
    margin: 0 0 14px !important;
    font-size: 28px !important;
  }

  .policy-section h3 {
    margin: 26px 0 8px !important;
    font-size: 20px !important;
  }

  .policy-section ul,
  .policy-section ol {
    padding-left: 24px;
  }

  .callout {
    padding: 22px 24px;
    border-radius: 18px;
    border: 1px solid rgba(101, 216, 255, 0.2);
    background: rgba(101, 216, 255, 0.06);
    color: var(--wc-soft) !important;
  }

  .support-box {
    margin-top: 24px;
    padding: 28px;
    border-radius: 24px;
    background: var(--wc-panel-strong);
    border: 1px solid var(--wc-line);
  }

  .support-box p {
    margin-bottom: 16px !important;
  }

  code {
    background: rgba(255, 255, 255, 0.08) !important;
    color: #ffffff !important;
    border-radius: 7px;
    padding: 2px 6px;
  }

  a {
    color: #92e3ff !important;
  }

  @media (max-width: 760px) {
    .wrapper {
      width: min(100% - 24px, 1080px) !important;
    }

    .privacy-page {
      padding: 28px 0 48px;
    }

    .privacy-nav {
      align-items: flex-start;
      margin-bottom: 28px;
    }

    .nav-links {
      justify-content: flex-end;
      gap: 12px;
      font-size: 14px;
    }

    .hero,
    .policy-section {
      padding: 26px;
      border-radius: 24px;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }

    .hero-copy {
      font-size: 18px;
    }
  }
</style>

<div class="privacy-page">
  <nav class="privacy-nav" aria-label="WristClaw privacy navigation">
    <a class="brand" href="/wristclaw-bridge/" aria-label="WristClaw home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>WristClaw</span>
    </a>
    <div class="nav-links">
      <a href="/wristclaw-bridge/">Docs</a>
      <a href="https://github.com/samboydevelopment/wristclaw-bridge">GitHub</a>
    </div>
  </nav>

  <section class="hero">
    <p class="eyebrow">Privacy Policy</p>
    <h1>Private by default, controlled by you.</h1>
    <p class="hero-copy">WristClaw connects your Apple Watch, iPhone, and your own Mac bridge. Samboy Development does not operate a server that receives your messages, photos, voice, screenshots, tokens, or agent responses.</p>
    <p class="updated">Last updated: June 3, 2026</p>
  </section>

  <div class="summary-grid" aria-label="Privacy summary">
    <article class="summary-card">
      <h2>No data collection</h2>
      <p>WristClaw does not collect, sell, track, or share your personal data with Samboy Development.</p>
    </article>
    <article class="summary-card">
      <h2>No analytics or ads</h2>
      <p>The app does not include analytics SDKs, advertising SDKs, third-party tracking SDKs, remote logging, or telemetry.</p>
    </article>
    <article class="summary-card">
      <h2>Your local setup</h2>
      <p>The iPhone app talks to your own Mac bridge, typically over your private Tailscale network.</p>
    </article>
  </div>

  <section class="policy-section">
    <h2>Scope</h2>
    <p>This policy explains what WristClaw and WristClaw Bridge do with data when you use the iPhone app, Apple Watch app, widget, and local Mac bridge.</p>
    <p>WristClaw is an independent third-party companion app for OpenClaw-compatible agents running on a user's own Mac. It is not affiliated with, authorized, or endorsed by the OpenClaw project or Apple Inc.</p>
  </section>

  <section class="policy-section">
    <h2>Data Collection</h2>
    <p>WristClaw does not collect data for Samboy Development.</p>
    <p>We do not receive app usage events, chat content, photos, voice recordings, transcripts, screenshots, device identifiers, location, contacts, health data, browsing history, bridge URLs, bearer tokens, diagnostics output, or agent responses.</p>
    <p class="callout">App Store privacy summary: the app is designed so Samboy Development does not collect data from the app.</p>
  </section>

  <section class="policy-section">
    <h2>What WristClaw Communicates With</h2>
    <p>WristClaw communicates only with services and devices that you control or configure:</p>
    <ol>
      <li><strong>Your paired iPhone and Apple Watch</strong> using Apple's WatchConnectivity framework.</li>
      <li><strong>Your local WristClaw Bridge</strong> running on your Mac.</li>
      <li><strong>Your OpenClaw-compatible agent</strong> through the bridge running on your Mac.</li>
      <li><strong>Optional user-configured services</strong> used by your OpenClaw setup, such as ElevenLabs for premium voice replies.</li>
    </ol>
    <p>The recommended setup exposes the bridge through Tailscale Serve inside your own tailnet. Tailscale, OpenClaw, and ElevenLabs are separate services controlled by their own terms and privacy policies. WristClaw does not provide your credentials to Samboy Development.</p>
  </section>

  <section class="policy-section">
    <h2>What Is Stored Locally</h2>
    <p>WristClaw may store the following data locally on your devices:</p>
    <ul>
      <li>The bridge bearer token generated during setup, stored in the iPhone Keychain.</li>
      <li>The bridge URL and diagnostics URLs, stored in local app settings.</li>
      <li>Your display name, agent display name, accent color, voice settings, selected session, and other preferences.</li>
      <li>Recent chat messages, response metadata, image thumbnails, and local message state inside the iPhone and Apple Watch app sandboxes.</li>
      <li>Temporary audio files used to play voice replies on Apple Watch.</li>
      <li>Temporary image files or thumbnails needed to display screenshots or photo attachments.</li>
    </ul>
    <p>This local data is used to make pairing, messaging, session switching, image display, and voice playback work across launches.</p>
  </section>

  <section class="policy-section">
    <h2>Photos, Speech, and Voice</h2>
    <h3>Photos</h3>
    <p>WristClaw may request Photo Library access on iPhone when you choose to attach a photo to a Watch message or preview recent photos.</p>
    <p>When you use this feature, the app reads the selected or recent photo locally, prepares a Watch-sized preview or an attachment payload, and sends it through your configured private path: iPhone to your Mac bridge to your OpenClaw-compatible agent.</p>
    <p>WristClaw does not send photos to Samboy Development. If your own OpenClaw setup forwards images to an AI provider, that behavior is controlled by your OpenClaw configuration and that provider's terms.</p>

    <h3>Speech Recognition</h3>
    <p>WristClaw may request Speech Recognition permission only when you dictate a message from Apple Watch or iPhone-supported flows.</p>
    <p>Speech transcription uses Apple's speech recognition capabilities. WristClaw does not send your voice recordings or transcripts to Samboy Development.</p>

    <h3>Voice Replies</h3>
    <p>By default, Watch voice replies use Apple's speech synthesis. If you enable ElevenLabs voice and your OpenClaw setup is configured for it, audio responses may be generated through ElevenLabs by your Mac/OpenClaw setup. WristClaw itself does not store or transmit your ElevenLabs API key to Samboy Development.</p>
  </section>

  <section class="policy-section">
    <h2>Pairing Tokens and Security</h2>
    <p>The WristClaw Bridge setup generates a bearer token used to authenticate requests from your iPhone/Watch to your Mac bridge.</p>
    <ul>
      <li>The token is stored in the iPhone Keychain.</li>
      <li>Pairing files generated by WristClaw Bridge may contain the token.</li>
      <li>Pairing files should stay private and should not be uploaded, published, or shared.</li>
      <li>If a pairing token is exposed, regenerate the pairing configuration from the bridge setup.</li>
    </ul>
    <p>The bridge binds to <code>127.0.0.1</code> by default and is intended to be exposed privately through Tailscale Serve. Public internet exposure is not part of the default setup.</p>
  </section>

  <section class="policy-section">
    <h2>Data Retention and Deletion</h2>
    <p>WristClaw stores app data locally for as long as the app remains installed or until you reset or re-pair your configuration.</p>
    <p>You can remove locally stored WristClaw data by:</p>
    <ul>
      <li>Deleting WristClaw from iPhone and Apple Watch.</li>
      <li>Clearing or regenerating your local bridge configuration on the Mac.</li>
      <li>Deleting generated bridge files under <code>~/.openclaw/openclaw-watch/</code> if you no longer need them. This directory name is retained for compatibility with existing bridge installs.</li>
    </ul>
    <p>Because Samboy Development does not collect or host your WristClaw data, there is no Samboy Development server-side account or cloud database to delete.</p>
  </section>

  <section class="policy-section">
    <h2>Children</h2>
    <p>WristClaw is intended as a productivity utility and does not knowingly collect data from children or anyone else.</p>
  </section>

  <section class="policy-section">
    <h2>Changes to This Policy</h2>
    <p>If this policy changes, the updated version will be posted at this same URL with a new Last updated date.</p>
  </section>

  <section class="policy-section">
    <h2>Contact</h2>
    <div class="support-box">
      <p>For privacy questions, support requests, or security concerns, open an issue in the public support repository.</p>
      <a class="policy-link" href="https://github.com/samboydevelopment/wristclaw-bridge">https://github.com/samboydevelopment/wristclaw-bridge</a>
    </div>
  </section>
</div>
