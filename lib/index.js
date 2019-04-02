
/**
 * Module dependencies.
 */

var integration = require('segmentio-integration');
var includesKeys = require('./utils').includesKeys;
var handlebars = require('handlebars');
var getName = require('./utils').getName;
var decode = require('entities').decodeHTML;
var extend = require('extend');

/**
 * Expose `Slack`
 */

var Slack = module.exports = integration('Slack')
  .channels(['server', 'mobile', 'client'])
  .ensure('settings.webhookUrl')
  .retries(1);

/**
 * Ensure.
 */

Slack.ensure(function(msg, settings) {
  if (msg.type() === 'identify' && settings.whiteListedTraits) {
    if (!settings.whiteListedTraits.length) return this.reject('You must white list at least one trait for `.identify()` calls');
    if (!includesKeys(msg.traits(), settings.whiteListedTraits)) return this.reject('Only identify calls that have match traits listed in the settings will be sent.');
  }
});

/**
 * Set up our prototype methods.
 */

Slack.prototype.identify = identify;
Slack.prototype.track = track;

/**
 * Identify.
 */

function identify(identify, fn) {
  // Double-check that identify event traits have been whitelisted
  if (!this.settings.whiteListedTraits) return fn();
  if (this.settings.whiteListedTraits && this.settings.whiteListedTraits.length > 0) {
    if (!includesKeys(identify.traits(), this.settings.whiteListedTraits)) return fn();
  }
  var template = this.settings.identifyTemplate || 'Identified {{name}}. \n{{traits}}';
  var compiled = handlebars.compile(template);
  var traits = identify.traits();
  var traitsText = '';
  for (var props in traits) {
    if (traits.hasOwnProperty(props)) traitsText += props + ': ' + traits[props] + '\n';
  }

  var templateData = extend(identify.traits(), {
    name: getName(identify),
    traits: traitsText
  });
  var text;

  try {
    text = compiled(templateData);
  } catch (e) {
    e.code = e.name;
    e.status = 400;
    return fn(e);
  }

  var payload = {
    text: decode(text),
    username: 'MetaRouter',
    icon_url: 'https://logo.clearbit.com/metarouter.io'
  };


  return this
    .post(this.settings.webhookUrl)
    .send(payload)
    .end(fn);
}

/**
 * Track.
 */

function track(track, fn){
  // If sending all Track events is disabled, then check to see if there is a template for this event in order to send. Otherwise, always send it
  var sendTrackEvent = !!this.settings.disableTrack ? !!this.settings.templates[track.event()] : true;
  var template = this.settings.templates[track.event()] || '{{name}} did {{event}}.';
  var compiled = handlebars.compile(template);
  var templateData = extend(track.json(), {
    name: getName(track)
  });
  var text;
  try {
    text = compiled(templateData);
  } catch (e) {
    e.code = e.name;
    e.status = 400;
    return fn(e);
  }
  var payload = {
    text: decode(text),
    username: 'MetaRouter',
    icon_url: 'https://logo.clearbit.com/metarouter.io'
  };

  if (this.settings.channels) {
    var channel = this.settings.channels[track.event()];
    if (channel) payload.channel = channel;
  }

  if (sendTrackEvent) {
    return this
    .post(this.settings.webhookUrl)
    .send(payload)
    .end(fn);
  } else {
    return fn();
  }
}
