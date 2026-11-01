# Express Router — Error Handling Notes

## Common error: "Cannot read properties of undefined (reading 'length')"

This error is thrown from `lib/router/index.js` inside Express when the router's
`handle` function receives a malformed layer stack. It typically happens when:

- A middleware function is registered as `undefined` (e.g. `app.use(someUndefinedVar)`).
- A route handler is exported incorrectly (`module.exports = {}` instead of a function).
- An async middleware throws before `next()` is called and no error handler is mounted.

### How Express dispatches requests

`Router.prototype.handle` iterates over `this.stack`, where each entry is a
`Layer`. If a layer or its `handle` method is `undefined`, property access such
as `stack.length` or `layer.handle_request` fails with a TypeError.

### Recommended fix

1. Verify every `app.use(...)` and `app.<method>(...)` call receives a defined
   function.
2. Add a centralized error-handling middleware with the four-argument signature
   `(err, req, res, next)` as the LAST middleware.
3. Wrap async handlers so rejected promises are forwarded to `next(err)`.

## References

- Express routing guide: https://expressjs.com/en/guide/routing.html
- Error handling: https://expressjs.com/en/guide/error-handling.html
