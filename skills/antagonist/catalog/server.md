# Attacks on the app's own API

Use these when `run.mjs` shows the app making requests to its own server.
Take the method, path and body from the REQUESTS section and replay them with
`curl`, using the cookie `run.mjs` prints. Stay on the local address.

## Who may do this

- Every request that reads or changes data, sent with no cookie or token:
  must be refused (401 or 403), never 200.
- Log out, then replay a request with the old cookie: refused.
- If records have ids, request another user's id. If the app has only one
  user, say that this could not be tested.

## What the server accepts

The browser's checks do not protect the server. Send directly:

- the body with each required field removed, in turn
- the wrong type for each field (a number as text, an object as a list)
- values the form would not allow (negative, empty, too long, unknown option)
- references to things that do not exist, or the same id twice
- an extra, unknown field
- a body that is not JSON; an empty body

A working server answers 4xx with a reason and changes nothing. Count as a
defect: a 5xx, a 200 that stores data the form would have refused when that
data then breaks a screen, and a 200 that silently drops part of the request.

After each accepted change, load the screen and check it still renders.
Server-side acceptance of something the form refuses is **low** on its own;
it becomes **medium** or **high** only when you show the damage in the UI or
to another user.

## When the server falls over

If a request or an action makes the whole server stop answering (every later
request hangs or is refused, not just the one you sent), that is a high
severity finding: one user takes the app down for everyone. Prove it with a
`"kind": "crash"` finding — a `reset` that restarts the server, a `baseline`
the healthy server survives, and the `attack`. Read the server's own log if
you can see it; the stack trace names the cause.

## Not a defect here

- A 5xx from a feature that needs a key or service the user did not
  configure (an AI assistant, payments, email). Note it under "Not covered".
- Credentials printed in the project's own README for a demo login.
