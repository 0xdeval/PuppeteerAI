'use strict';

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a browser automation AI assistant. Your job is to analyze screenshots of web pages and return structured JSON instructions so that an automation script can perform actions.

CRITICAL RULES:
1. You MUST return ONLY valid JSON. No markdown, no prose, no code fences, no backticks. Raw JSON only.
2. Your entire response must start with "{" and end with "}". Nothing before or after.
3. Every response MUST include all required fields: observation, action, confidence, reasoning.
4. Describe exactly what you see in the screenshot before deciding on an action.
5. If you are uncertain, return a low confidence score (below 0.7) so the system can escalate.
6. Never guess at element positions — only describe what is visually present.
7. If the page looks like a login page, CAPTCHA, or access wall, say so in your reasoning.
8. Coordinates (x, y) should be the center of the element to interact with, in CSS pixels.
9. For fields that do not apply, use null — never omit them.

Required JSON fields (include ALL of these every time):
- "observation": string — brief description of what you see on screen
- "action": string — MUST be exactly one of these words: click, type, scroll, wait, none, done, error — no other values allowed
- "x": number or null — x coordinate as an INTEGER (e.g. 152), null if action is not click
- "y": number or null — y coordinate as an INTEGER (e.g. 740), null if action is not click
- "text": string or null — text to type (null if action is not type)
- "scroll_direction": "up" or "down" or null
- "scroll_amount": number or null — pixels to scroll as an INTEGER (e.g. 300), null if not scrolling
- "confidence": number — MUST be a decimal float between 0.0 and 1.0 (e.g. 0.95), never a word like "high"
- "reasoning": string — why you chose this action
- "status": string or null — MUST be exactly one of: logged_in, logged_out, post_success, post_failed, session_expired, ready_to_type, image_attached — or null if not applicable
- "post_url": string or null — URL of the created post if visible, otherwise null

Example of a valid response (a click action):
{"observation":"I see the X home feed with a blue Post button in the left sidebar","action":"click","x":152,"y":740,"text":null,"scroll_direction":null,"scroll_amount":null,"confidence":0.95,"reasoning":"The Post button is clearly visible and needs to be clicked to open the compose dialog","status":"logged_in","post_url":null}

Example of a valid response (session check, logged out):
{"observation":"I see a login page with email and password fields and a Sign In button","action":"none","x":null,"y":null,"text":null,"scroll_direction":null,"scroll_amount":null,"confidence":0.98,"reasoning":"No user-specific navigation is visible; this is a login wall","status":"logged_out","post_url":null}`;

// ─── Task Step Definitions ────────────────────────────────────────────────────

const TASKS = {
  /**
   * Determine whether the user is currently logged in.
   */
  check_session: {
    x: [
      {
        id: 'check_logged_in',
        instruction: `You are looking at a screenshot of X (Twitter). Determine if the user (avatar: {{avatar}}) is currently logged in.

Signs of being LOGGED IN:
- Home feed with tweets/posts visible
- Left sidebar with Home, Explore, Notifications, Profile links
- A "Post" button visible in the sidebar
- Profile avatar or name visible in the interface

Signs of being LOGGED OUT:
- A login form with email/phone and password fields
- "Sign in" or "Create account" buttons prominently shown
- A landing/marketing page with no personal feed

Signs of SESSION EXPIRY:
- "Your session has expired" or similar message
- Redirected to a login page unexpectedly
- A security verification or CAPTCHA prompt

Set status to: logged_in, logged_out, or session_expired.
Return confidence 1.0 only if you are absolutely certain.`,
      },
    ],
    facebook: [
      {
        id: 'check_logged_in',
        instruction: `You are looking at a screenshot of Facebook. Determine if the user (avatar: {{avatar}}) is currently logged in.

Signs of being LOGGED IN:
- News feed with posts visible
- Top navigation bar with Home, profile name/avatar, notifications
- A compose area visible — may say "What's on your mind?" (English) or "Что у вас нового?" (Russian) or similar in any language

Signs of being LOGGED OUT:
- A login form with email and password fields
- "Log in" or "Create new account" buttons shown
- Facebook's landing/marketing page

Signs of SESSION EXPIRY:
- "You've been logged out" or similar message
- Redirected to login unexpectedly
- A security checkpoint or verification prompt

Set status to: logged_in, logged_out, or session_expired.
Return confidence 1.0 only if you are absolutely certain.`,
      },
    ],
  },

  /**
   * Create a new post on the platform.
   */
  create_post: {
    x: [
      {
        id: 'find_compose_button',
        instruction: `You are looking at a screenshot of X (Twitter).
Your goal is to open the post compose dialog. There are three ways it can appear depending on the layout:

1. A black button labeled "Post" in the left sidebar (expanded sidebar layout)
2. A black circular button with a feather/pencil/compose icon at the bottom of the left sidebar (collapsed icon-only sidebar layout)
3. A "What's happening?" text input area already visible in the feed — if you see it, click directly on it

Click whichever of these three you can see. Priority: "What's happening?" input first (already open), then "Post" button or feather icon.

If the page is still loading (spinner visible, feed not yet rendered), return action "wait".
If the compose dialog is already open with a text area showing "What's happening?", return action "none" and status "ready_to_type".`,
      },
      {
        id: 'type_post_text',
        instruction: `You are looking at a screenshot of X (Twitter).
The compose dialog should be open. The text area has placeholder text "What's happening?".
If the text area is visible, click it to focus it.
If it already has a cursor or looks focused, use action "none" and status "ready_to_type".
Only return action "error" if the compose dialog is not open at all.`,
      },
      {
        id: 'attach_image',
        instruction: `You are looking at a screenshot of X (Twitter).
An image needs to be attached to this post.
Look for the image/photo icon in the toolbar below the text area (it looks like a landscape/photo icon).
Click it to open the file picker.
If an image thumbnail is already visible in the compose area, return action "none" with status "image_attached".`,
      },
      {
        id: 'verify_image',
        instruction: `You are looking at a screenshot of X (Twitter).
Check if an image has been successfully attached to the post.
Look for an image thumbnail preview or a small image card inside the compose area.
If image is attached, return action "none" with status "image_attached" and confidence 0.9+.
If no image is visible, return action "error" with reasoning explaining what you see.`,
      },
      {
        id: 'click_post_button',
        instruction: `You are looking at a screenshot of X (Twitter).
The compose dialog is open and the post text has been typed. Find and click the "Post" button to publish.
This button is inside or near the compose dialog — it is NOT the "Post" button in the sidebar.
Do not click Cancel or Close.`,
      },
      {
        id: 'verify_post',
        instruction: `You are looking at a screenshot of X (Twitter).
Determine if the post was successfully published.

Signs of SUCCESS:
- Compose dialog is closed and the home feed is visible
- A confirmation notification like "Your post was sent" is shown
- The composed text now appears as a post in the feed

Signs of FAILURE:
- Compose dialog is still open with an error message
- A rate limit or restriction warning is visible
- A login page appeared

If you can see a link or URL to the new post, set it as post_url.
Set status to "post_success" or "post_failed".`,
      },
    ],
    facebook: [
      {
        id: 'find_compose_button',
        instruction: `You are looking at a screenshot of Facebook.

There are TWO distinct states — read carefully:

STATE A — The "What's on your mind" bar is visible but the post dialog is NOT open (action required):
- Look at the TOP NAVIGATION BAR at the very top of the screen (the dark bar with the Facebook logo on the left).
- In the CENTER of that navigation bar there is a rounded input that says "What's on your mind, ...?" or "Что у вас нового, ...?"
- This bar is at the very top of the page — its y-coordinate will be between 20 and 55 pixels from the top of the image.
- DO NOT confuse this with the Stories row (which shows circular profile pictures and a "Create story" card) — that is BELOW the navigation bar and should NOT be clicked.
- You MUST click the "What's on your mind" bar in the navigation bar. Return action "click" with x,y at the center of that input bar.

STATE B — The post dialog is open (no action needed):
- A large popup overlay is visible on top of the feed.
- It has a full-size text area, the user's avatar at the top, and a "Опубликовать"/"Post" button at the bottom (gray when no text is entered).
- Only in this state: return action "none" and status "ready_to_type".

IMPORTANT: If you see the "What's on your mind" bar in the navigation bar, that means STATE A — click it. The y-coordinate of your click MUST be between 20 and 55. Do NOT click on the stories row or feed area below.

If the page is still loading, return action "wait".`,
      },
      {
        id: 'type_post_text',
        instruction: `You are looking at a screenshot of Facebook.
A post dialog should be open — a large popup overlay on top of the feed with the user's avatar at the top and a "Опубликовать"/"Post" button at the bottom.

Inside the dialog find the large text area (it will say "Что у вас нового?" in Russian or "What's on your mind?" in English as placeholder text).

If the text area is visible and NOT focused (no cursor inside it): return action "click" with its center coordinates.
If the text area is already focused (cursor or blinking caret visible inside it): return action "none" and status "ready_to_type".
If the post dialog is not open at all (you only see the feed with the small collapsed bar): return action "error" with reasoning "post dialog not open".
Never return action "scroll" at this step.`,
      },
      {
        id: 'attach_image',
        instruction: `You are looking at a screenshot of Facebook.
A post dialog is open. An image needs to be attached.
Look for a "Фото/видео" (Russian) or "Photo/Video" (English) button, or a camera/photo icon in the toolbar at the bottom of the dialog.
Click it to open the file picker.
If an image preview is already visible inside the dialog, return action "none" with status "image_attached".`,
      },
      {
        id: 'verify_image',
        instruction: `You are looking at a screenshot of Facebook.
Check if an image has been successfully attached to the post inside the post dialog.
Look for an image thumbnail or preview inside the dialog.
If an image is attached: return action "none" with status "image_attached" and confidence 0.9+.
If no image is visible: return action "error" with reasoning explaining what you see.`,
      },
      {
        id: 'click_post_button',
        instruction: `You are looking at a screenshot of Facebook.
A post dialog is open. Find the publish button at the bottom of the dialog.

TWO possible states:
1. Button is BLUE ("Опубликовать" / "Post") — text was typed. Click it to publish. Return action "click" with its coordinates.
2. Button is GREY/DISABLED — text area is empty. Return action "error" with reasoning "post button is disabled, text was not typed".

Do NOT click the X/close button. Do NOT confuse the blue button with grey — any blue color means it is active.`,
      },
      {
        id: 'verify_post',
        instruction: `You are looking at a screenshot of Facebook.
Determine if the post was successfully published.

Signs of SUCCESS:
- The post dialog is closed and the main feed is visible
- A brief loading spinner may be visible — this is still a success state, set confidence 0.7
- The posted text appears as a new post in the feed

Signs of FAILURE:
- The post dialog is still open with an error message
- A restriction notice or login prompt appeared

Set status to "post_success" or "post_failed". If a spinner is visible and the dialog just closed, set status "post_success" with confidence 0.75.`,
      },
    ],
  },

  /**
   * Reply to an existing post.
   */
  reply_to_post: {
    x: [
      {
        id: 'find_reply_button',
        instruction: `You are looking at a screenshot of X (Twitter).
Find the reply input field that contains the placeholder text "Post your reply" and click on it.
This input field is located below the original tweet. Click directly on it to focus it.
If you cannot find it, return action "error" with reasoning explaining what you see.`,
      },
      {
        id: 'type_reply',
        instruction: `You are looking at a screenshot of X (Twitter).
Check whether the reply input is focused and ready for typing.

Signs that the input IS active and ready:
- A "Replying to @username" line is visible above the input area
- A toolbar with icons (image, GIF, emoji, location, flag, etc.) is visible below the input
- A "Reply" button is visible to the right of the toolbar
- The "Post your reply" placeholder or a cursor is visible in the input area

If ALL of these signs are visible, the input is active — return action "none" and status "ready_to_type".
If the input area is visible but these signs are NOT present (not yet focused), click directly on the "Post your reply" text area to focus it.
If any unrelated popup or dialog is open, return action "error" describing what you see.
If no reply input is visible at all, return action "error".`,
      },
      {
        id: 'submit_reply',
        instruction: `You are looking at a screenshot of X (Twitter).
You have just typed a reply into the reply input field. Now find and click the "Reply" button to submit it.
After text is typed, the "Reply" button becomes active and fully colored (white or black depending on the system theme) — click it.
Do not click it if it still appears greyed out or disabled.
Do not click any other button such as Cancel, Close, Share, or Bookmark.`,
      },
      {
        id: 'verify_reply',
        instruction: `You are looking at a screenshot of X (Twitter).
Has the reply been successfully posted?
Look for the reply text now appearing below the original tweet in the replies section.
Set status to "post_success" or "post_failed".`,
      },
    ],
    facebook: [
      {
        id: 'find_reply_button',
        instruction: `You are looking at a screenshot of a Facebook post page or post modal popup.
Find the comment input field. It is a rounded input bar that says:
- "Напишите комментарий…" (Russian)
- "Write a comment…" (English)

It is located at the BOTTOM of the post or modal — below the post content, below any attachment/emoji icon buttons.

If the input IS visible: click directly on it. Return action "click" with its x,y coordinates.
If the input is already focused (cursor visible inside it): return action "none" and status "ready_to_type".
If the input is NOT visible (cut off below the screen, or you can only see attachment/emoji buttons but no text input): return action "scroll" with scroll_direction "down" and scroll_amount 200 so it can be revealed.
Only return action "error" if no comment section exists at all on the page.`,
      },
      {
        id: 'type_reply',
        instruction: `You are looking at a screenshot of Facebook.
The comment input field should now be focused.

Signs it IS focused and ready:
- A cursor or blinking caret is visible inside the input field
- The input field appears active/highlighted

If focused: return action "none" and status "ready_to_type".
If visible but not focused: return action "click" with its coordinates.
If not visible at all: return action "scroll" with scroll_direction "down" and scroll_amount 150.
Only return action "error" if there is no comment input anywhere on the page.`,
      },
      {
        id: 'submit_reply',
        instruction: `You are looking at a screenshot of Facebook.
Text has been typed into the comment input. Submit it.

Look for a blue send icon (arrow pointing right) to the right of the comment input field and click it.
If the send icon is not visible yet (the field may not be focused): click the comment input field first, then return action "click" with the input's coordinates.
If you can see the blue send arrow: return action "click" with its coordinates.
Do not click any other button.`,
      },
      {
        id: 'verify_reply',
        instruction: `You are looking at a screenshot of Facebook.
Has the comment been successfully posted?
Look for the typed comment text now appearing as a new entry in the comments section below the post.
Set status to "post_success" or "post_failed".`,
      },
    ],
  },
};

// ─── Template Helpers ─────────────────────────────────────────────────────────

/**
 * Replaces {{variable}} placeholders in an instruction string.
 * @param {string} template
 * @param {Record<string, string>} vars
 * @returns {string}
 */
function formatInstruction(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{{${key}}}`);
}

/**
 * Normalises a platform string to a TASKS key ('x' or 'facebook').
 * Falls back to 'x' for unknown platforms.
 * @param {string} platform
 * @returns {string}
 */
function normalisePlatform(platform) {
  const p = (platform || '').toLowerCase();
  if (p === 'facebook') return 'facebook';
  return 'x'; // covers 'x', 'twitter', 'x/twitter', etc.
}

/**
 * Returns the steps for a given task, with placeholders filled.
 * For tasks that have platform-specific variants, the correct variant is
 * selected automatically based on vars.platform.
 *
 * @param {string} taskName  - Key in TASKS object.
 * @param {Record<string, string>} vars  - e.g. { platform: 'X', avatar: 'aria' }
 * @returns {{ id: string, instruction: string }[]}
 */
function getTaskSteps(taskName, vars = {}) {
  const task = TASKS[taskName];
  if (!task) throw new Error(`Unknown task: ${taskName}`);

  // Tasks with platform-specific variants have no .steps array at the top level
  const steps = task.steps || task[normalisePlatform(vars.platform)];
  if (!steps) throw new Error(`No steps found for task '${taskName}' on platform '${vars.platform}'`);

  return steps.map((step) => ({
    id: step.id,
    instruction: formatInstruction(step.instruction, vars),
  }));
}

module.exports = {
  SYSTEM_PROMPT,
  TASKS,
  formatInstruction,
  getTaskSteps,
};
