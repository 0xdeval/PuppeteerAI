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
- "action": string — exactly one of: click | type | scroll | wait | none | done | error
- "x": number or null — x coordinate to click (null if action is not click)
- "y": number or null — y coordinate to click (null if action is not click)
- "text": string or null — text to type (null if action is not type)
- "scroll_direction": "up" or "down" or null
- "scroll_amount": number or null — pixels to scroll
- "confidence": number — float from 0.0 to 1.0, how certain you are
- "reasoning": string — why you chose this action
- "status": string or null — one of: logged_in | logged_out | post_success | post_failed | session_expired | ready_to_type | image_attached (null if not applicable)
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
- A "What's on your mind?" compose area visible

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
Find and click the "Post" button in the left sidebar to open the compose dialog.
It is a prominent button, usually dark or black, labeled "Post".
If the compose dialog is already open and the text area (placeholder: "What's happening?") is visible, use action "none" and status "ready_to_type".`,
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
Find and click the "What's on your mind?" text area or "Create post" button to open the compose dialog.
If the compose dialog is already open and ready for typing, use action "none" and status "ready_to_type".`,
      },
      {
        id: 'type_post_text',
        instruction: `You are looking at a screenshot of Facebook.
The compose dialog should be open with a text area saying "What's on your mind?".
Click the text area to focus it.
If it already has a cursor or looks focused, use action "none" and status "ready_to_type".
Only return action "error" if the compose dialog is not open at all.`,
      },
      {
        id: 'attach_image',
        instruction: `You are looking at a screenshot of Facebook.
An image needs to be attached. Look for a "Photo/Video" button or camera icon in the compose dialog toolbar.
Click it to open the file picker.
If an image preview is already visible, return action "none" with status "image_attached".`,
      },
      {
        id: 'verify_image',
        instruction: `You are looking at a screenshot of Facebook.
Check if an image has been successfully attached to the post.
Look for an image thumbnail or preview inside the compose dialog.
If image is attached, return action "none" with status "image_attached" and confidence 0.9+.
If no image is visible, return action "error" with reasoning explaining what you see.`,
      },
      {
        id: 'click_post_button',
        instruction: `You are looking at a screenshot of Facebook.
The compose dialog is open and text has been typed. Find and click the "Post" button to publish.
Do not click Cancel or Close.`,
      },
      {
        id: 'verify_post',
        instruction: `You are looking at a screenshot of Facebook.
Determine if the post was successfully published.

Signs of SUCCESS:
- Compose dialog is closed and the feed is visible
- The composed text now appears as a post in the feed

Signs of FAILURE:
- Compose dialog is still open with an error
- A restriction or login prompt appeared

Set status to "post_success" or "post_failed".`,
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
The reply input field should now be focused. It may still show the placeholder "Post your reply" or have a cursor in it.
If the input is ready for typing, return action "none" and status "ready_to_type".
If the input is visible but not focused, click it.
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
        instruction: `You are looking at a screenshot of Facebook.
Find the comment input field below the post — it typically says "Write a comment…" — and click on it to focus it.
If you cannot find it, return action "error" with reasoning explaining what you see.`,
      },
      {
        id: 'type_reply',
        instruction: `You are looking at a screenshot of Facebook.
The comment input field should now be focused, showing "Write a comment…" placeholder or a cursor.
If the input is ready for typing, return action "none" and status "ready_to_type".
If the input is visible but not focused, click it.
If no comment input is visible, return action "error".`,
      },
      {
        id: 'submit_reply',
        instruction: `You are looking at a screenshot of Facebook.
You have typed a comment. Submit it by pressing Enter or clicking the send/post icon next to the comment input.
Do not click Cancel or any unrelated button.`,
      },
      {
        id: 'verify_reply',
        instruction: `You are looking at a screenshot of Facebook.
Has the comment been successfully posted?
Look for the comment text now appearing in the comments section below the post.
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
