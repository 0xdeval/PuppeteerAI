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
    steps: [
      {
        id: 'check_logged_in',
        instruction: `Look at this screenshot of {{platform}}.
Determine if the user (avatar: {{avatar}}) is currently logged in.

Signs of being LOGGED IN:
- Home feed with posts visible
- Navigation with profile icon, home, notifications etc.
- Compose/Tweet/Post button visible
- Profile name or avatar in the interface

Signs of being LOGGED OUT:
- Login form with email/phone/password fields
- "Sign in", "Log in", "Create account" buttons prominently displayed
- No user-specific navigation
- Landing/marketing page

Signs of SESSION EXPIRY:
- "Your session has expired" message
- Redirect to login page
- Security verification prompt

Set status to: logged_in, logged_out, or session_expired.
Return confidence 1.0 only if you are absolutely certain.`,
      },
    ],
  },

  /**
   * Create a new post on the platform.
   */
  create_post: {
    steps: [
      {
        id: 'find_compose_button',
        instruction: `Look at this screenshot of {{platform}}.
Find the button or link to compose/create a new post.
On X/Twitter this is typically: a "Post" button (blue, often in sidebar), a compose icon, or the text area saying "What is happening?!".
On Facebook this is typically: a "What's on your mind?" text area or a "Create post" button.

Click the compose button or area. If there is already a text input/textarea focused and ready for typing, use action "none" and set status to "ready_to_type".`,
      },
      {
        id: 'type_post_text',
        instruction: `Look at this screenshot of {{platform}}.
A compose/post dialog or text area should be visible and active after clicking the compose button.

On X/Twitter, the text area is often a div with placeholder text "What is happening?!" — it may not look like a traditional input box.
On Facebook, it is usually a div or textarea saying "What's on your mind?".

If a compose dialog/modal is open (you can tell by a "Post"/"Tweet" submit button being visible near the text area), click the text input area.
If the text area already looks focused or has a cursor, use action "none" and status "ready_to_type".
If a dialog is open but you cannot locate the text area, click in the center of the dialog.
Only return action "error" if there is NO compose dialog open at all (e.g. you only see the home feed with no modal).`,
      },
      {
        id: 'attach_image',
        instruction: `Look at this screenshot of {{platform}}.
An image needs to be attached to this post.
Look for a photo/image attachment button (camera icon, photo icon, "Add photo" text, image upload area).
Click that button so a file picker appears (even though we'll use the hidden input directly).

If the image appears to already be attached (thumbnail visible), return action "none" with status "image_attached".`,
      },
      {
        id: 'verify_image',
        instruction: `Look at this screenshot of {{platform}}.
Check if an image has been successfully attached to the post.
Look for: an image thumbnail preview, a small image card in the compose area, or an "x" button near an image.

If image is attached, return action "none" with status "image_attached" and confidence 0.9+.
If no image visible, return action "error" with reasoning explaining what you see.`,
      },
      {
        id: 'click_post_button',
        instruction: `Look at this screenshot of {{platform}}.
Find and click the final "Post", "Tweet", "Share", or "Publish" button to submit the post.

This button:
- Is usually blue, purple, or the platform's primary color
- Says "Post", "Tweet", "Share", "Publish", or similar
- Is NOT the compose/new post button (that already got us here)
- Should be near the compose area or at the bottom of a dialog

Click it. Do not click Cancel or Close.`,
      },
      {
        id: 'verify_post',
        instruction: `Look at this screenshot of {{platform}}.
Determine if the post was successfully published.

Signs of SUCCESS:
- Post appears in feed
- Confirmation toast/notification ("Your post was sent", "Tweet sent!", etc.)
- Compose dialog closed and feed is visible
- The composed text is now shown as a post

Signs of FAILURE:
- Error message visible
- Compose dialog still open with error
- Rate limit warning
- Login wall appeared

If you can see the URL or a link to the new post, extract it for post_url.
Set status to "post_success" or "post_failed" accordingly.`,
      },
    ],
  },

  /**
   * Reply to an existing post.
   */
  reply_to_post: {
    steps: [
      {
        id: 'find_reply_button',
        instruction: `Look at this screenshot of {{platform}}.
You should be viewing a specific post/tweet/status. Find and click the reply button for that post.

On X/Twitter: look for a speech bubble / comment icon below the post.
On Facebook: look for a "Comment" button or link below the post.

Click the reply/comment button to open the reply input.`,
      },
      {
        id: 'type_reply',
        instruction: `Look at this screenshot of {{platform}}.
A reply text input should now be visible and active.
If the input is ready, return action "none" and status "ready_to_type".
If you need to click the input first, click it.
If no reply input is visible, return action "error".`,
      },
      {
        id: 'submit_reply',
        instruction: `Look at this screenshot of {{platform}}.
Find and click the button to submit/post the reply.
This might say "Reply", "Comment", "Post reply", or similar.
Do not click Cancel.`,
      },
      {
        id: 'verify_reply',
        instruction: `Look at this screenshot of {{platform}}.
Has the reply been successfully posted?
Look for the reply text now appearing in the comments/replies section.
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
 * Returns the steps for a given task, with placeholders filled.
 * @param {string} taskName  - Key in TASKS object.
 * @param {Record<string, string>} vars  - e.g. { platform: 'X/Twitter', avatar: 'aria' }
 * @returns {{ id: string, instruction: string }[]}
 */
function getTaskSteps(taskName, vars = {}) {
  const task = TASKS[taskName];
  if (!task) throw new Error(`Unknown task: ${taskName}`);
  return task.steps.map((step) => ({
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
