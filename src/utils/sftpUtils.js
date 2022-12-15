const { timingSafeEqual } = require('crypto');

const checkValue = (input, allowed) => {
    const autoReject = (input.length !== allowed.length);
    if (autoReject) {
      // Prevent leaking length information by always making a comparison with the
      // same input when lengths don't match what we expect ...
      allowed = input;
    }
    const isMatch = timingSafeEqual(input, allowed);
    return (!autoReject && isMatch);
  }

const checkAuthnticationMethod = (authenticationMethod, password, allowedPassword) => {
switch (authenticationMethod) {
    case 'password':
    if (!checkValue(Buffer.from(password), allowedPassword))
        return false;
        break;
    default:
    return false;
}

return true;
}

  module.exports = { checkValue, checkAuthnticationMethod };