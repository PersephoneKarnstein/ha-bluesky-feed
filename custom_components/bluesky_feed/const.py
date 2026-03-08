"""Constants for the Bluesky Feed integration."""

DOMAIN = "bluesky_feed"

DEFAULT_PDSHOST = "https://bsky.social"
PUBLIC_API_HOST = "https://public.api.bsky.app"
PLC_DIRECTORY = "https://plc.directory"

CONF_HANDLE = "handle"
CONF_PASSWORD = "app_password"
CONF_PDSHOST = "pds_host"
CONF_FEED_TYPE = "feed_type"
CONF_AUTHOR_HANDLE = "author_handle"
CONF_FEED_URI = "feed_uri"
CONF_POST_LIMIT = "post_limit"
CONF_UPDATE_INTERVAL = "update_interval"

FEED_TYPE_TIMELINE = "timeline"
FEED_TYPE_AUTHOR = "author"
FEED_TYPE_CUSTOM = "custom"

DEFAULT_POST_LIMIT = 20
DEFAULT_UPDATE_INTERVAL = 300
