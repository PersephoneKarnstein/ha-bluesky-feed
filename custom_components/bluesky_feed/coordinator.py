"""DataUpdateCoordinator for Bluesky Feed."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.update_coordinator import (
    DataUpdateCoordinator,
    UpdateFailed,
)

from .const import (
    DOMAIN,
    PDSHOST,
    PUBLIC_API_HOST,
    CONF_HANDLE,
    CONF_PASSWORD,
    CONF_FEED_TYPE,
    CONF_AUTHOR_HANDLE,
    CONF_FEED_URI,
    CONF_POST_LIMIT,
    CONF_UPDATE_INTERVAL,
    FEED_TYPE_TIMELINE,
    FEED_TYPE_CUSTOM,
    DEFAULT_POST_LIMIT,
    DEFAULT_UPDATE_INTERVAL,
)

_LOGGER = logging.getLogger(__name__)


class BlueskyFeedCoordinator(DataUpdateCoordinator[list[dict[str, Any]]]):
    """Coordinator to fetch and cache Bluesky feed data."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the coordinator."""
        self._handle = entry.data[CONF_HANDLE]
        self._password = entry.data[CONF_PASSWORD]
        self._feed_type = entry.data.get(CONF_FEED_TYPE, FEED_TYPE_TIMELINE)
        self._author_handle = entry.data.get(CONF_AUTHOR_HANDLE, "")
        self._feed_uri = entry.data.get(CONF_FEED_URI, "")
        self._access_jwt: str | None = None
        self._refresh_jwt: str | None = None
        self._did: str | None = None
        self._post_limit = entry.options.get(
            CONF_POST_LIMIT,
            entry.data.get(CONF_POST_LIMIT, DEFAULT_POST_LIMIT),
        )

        update_interval = entry.options.get(
            CONF_UPDATE_INTERVAL,
            entry.data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
        )

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=update_interval),
        )

    async def _create_session(self) -> None:
        """Create an authenticated session with Bluesky."""
        url = f"{PDSHOST}/xrpc/com.atproto.server.createSession"
        payload = {"identifier": self._handle, "password": self._password}

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self._access_jwt = data["accessJwt"]
                    self._refresh_jwt = data["refreshJwt"]
                    self._did = data["did"]
                else:
                    text = await resp.text()
                    raise UpdateFailed(
                        f"Authentication failed ({resp.status}): {text}"
                    )

    async def _refresh_session(self) -> None:
        """Refresh the access token."""
        if not self._refresh_jwt:
            await self._create_session()
            return

        url = f"{PDSHOST}/xrpc/com.atproto.server.refreshSession"
        headers = {"Authorization": f"Bearer {self._refresh_jwt}"}

        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self._access_jwt = data["accessJwt"]
                    self._refresh_jwt = data["refreshJwt"]
                else:
                    await self._create_session()

    @staticmethod
    async def _is_token_expired(resp: aiohttp.ClientResponse) -> bool:
        """Check if a response indicates an expired token."""
        if resp.status == 401:
            return True
        if resp.status == 400:
            try:
                body = await resp.json()
                return body.get("error") == "ExpiredToken"
            except Exception:
                pass
        return False

    async def _api_get(
        self, url: str, params: dict, auth: bool = True
    ) -> dict:
        """Make an authenticated GET request with automatic token refresh."""
        headers = {}
        if auth and self._access_jwt:
            headers["Authorization"] = f"Bearer {self._access_jwt}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, params=params) as resp:
                if auth and await self._is_token_expired(resp):
                    await self._refresh_session()
                    headers["Authorization"] = f"Bearer {self._access_jwt}"
                    async with session.get(
                        url, headers=headers, params=params
                    ) as retry:
                        if retry.status == 200:
                            return await retry.json()
                        text = await retry.text()
                        raise UpdateFailed(
                            f"API request failed ({retry.status}): {text}"
                        )
                elif resp.status == 200:
                    return await resp.json()
                else:
                    text = await resp.text()
                    raise UpdateFailed(
                        f"API request failed ({resp.status}): {text}"
                    )

    async def _api_post(
        self, url: str, payload: dict, auth: bool = True
    ) -> dict:
        """Make an authenticated POST request with automatic token refresh."""
        headers = {"Content-Type": "application/json"}
        if auth and self._access_jwt:
            headers["Authorization"] = f"Bearer {self._access_jwt}"

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url, headers=headers, json=payload
            ) as resp:
                if auth and await self._is_token_expired(resp):
                    await self._refresh_session()
                    headers["Authorization"] = f"Bearer {self._access_jwt}"
                    async with session.post(
                        url, headers=headers, json=payload
                    ) as retry:
                        if retry.status == 200:
                            return await retry.json()
                        text = await retry.text()
                        raise UpdateFailed(
                            f"API POST failed ({retry.status}): {text}"
                        )
                elif resp.status == 200:
                    return await resp.json()
                else:
                    text = await resp.text()
                    raise UpdateFailed(
                        f"API POST failed ({resp.status}): {text}"
                    )

    async def _fetch_timeline(self) -> dict:
        """Fetch the authenticated user's home timeline."""
        url = f"{PDSHOST}/xrpc/app.bsky.feed.getTimeline"
        return await self._api_get(url, {"limit": self._post_limit})

    async def _fetch_author_feed(self) -> dict:
        """Fetch a specific author's feed."""
        actor = self._author_handle or self._handle
        url = f"{PUBLIC_API_HOST}/xrpc/app.bsky.feed.getAuthorFeed"
        return await self._api_get(
            url,
            {
                "actor": actor,
                "limit": self._post_limit,
                "filter": "posts_and_author_threads",
            },
            auth=True,
        )

    async def _fetch_custom_feed(self) -> dict:
        """Fetch a custom feed by its AT URI."""
        url = f"{PUBLIC_API_HOST}/xrpc/app.bsky.feed.getFeed"
        return await self._api_get(
            url,
            {
                "feed": self._feed_uri,
                "limit": self._post_limit,
            },
            auth=True,
        )

    @staticmethod
    def _parse_images(embed: dict) -> list[dict[str, str]]:
        """Extract images from a post embed."""
        images = []
        if not embed:
            return images

        embed_type = embed.get("$type", "")
        if "images" in embed_type:
            for img in embed.get("images", []):
                images.append(
                    {
                        "thumb": img.get("thumb", ""),
                        "fullsize": img.get("fullsize", ""),
                        "alt": img.get("alt", ""),
                    }
                )
        elif "recordWithMedia" in embed_type:
            media = embed.get("media", {})
            if "images" in media.get("$type", ""):
                for img in media.get("images", []):
                    images.append(
                        {
                            "thumb": img.get("thumb", ""),
                            "fullsize": img.get("fullsize", ""),
                            "alt": img.get("alt", ""),
                        }
                    )
        return images

    @staticmethod
    def _parse_external(embed: dict) -> dict | None:
        """Extract external link preview from a post embed."""
        if not embed:
            return None
        embed_type = embed.get("$type", "")
        if "external" in embed_type:
            ext = embed.get("external", {})
            return {
                "uri": ext.get("uri", ""),
                "title": ext.get("title", ""),
                "description": ext.get("description", ""),
                "thumb": ext.get("thumb", ""),
            }
        return None

    @staticmethod
    def _parse_quote(embed: dict) -> dict | None:
        """Extract quoted post from a post embed."""
        if not embed:
            return None
        embed_type = embed.get("$type", "")

        rec = None
        if "recordWithMedia" in embed_type:
            # recordWithMedia nests the record one level deeper
            rec = embed.get("record", {}).get("record", {})
        elif "record" in embed_type and "record" in embed:
            rec = embed["record"]

        if rec and rec.get("author"):
            author = rec.get("author", {})
            value = rec.get("value", {})
            return {
                "author_handle": author.get("handle", ""),
                "author_name": author.get("displayName", ""),
                "author_avatar": author.get("avatar", ""),
                "text": value.get("text", ""),
                "created_at": value.get("createdAt", ""),
            }
        return None

    def _parse_feed(self, data: dict) -> list[dict[str, Any]]:
        """Parse the API response into a list of post dicts."""
        posts = []
        for item in data.get("feed", []):
            post = item.get("post", {})
            author = post.get("author", {})
            record = post.get("record", {})
            embed = post.get("embed") or {}

            reason = item.get("reason", {})
            is_repost = (
                reason.get("$type", "")
                == "app.bsky.feed.defs#reasonRepost"
            )
            reposted_by = ""
            if is_repost:
                by = reason.get("by", {})
                reposted_by = (
                    by.get("displayName") or by.get("handle", "")
                )

            reply = item.get("reply", {})
            reply_parent = reply.get("parent", {})
            reply_parent_author = reply_parent.get("author", {})

            posts.append(
                {
                    "uri": post.get("uri", ""),
                    "cid": post.get("cid", ""),
                    "author_did": author.get("did", ""),
                    "author_handle": author.get("handle", ""),
                    "author_name": author.get("displayName", ""),
                    "author_avatar": author.get("avatar", ""),
                    "text": record.get("text", ""),
                    "facets": record.get("facets", []),
                    "created_at": record.get("createdAt", ""),
                    "indexed_at": post.get("indexedAt", ""),
                    "images": self._parse_images(embed),
                    "external": self._parse_external(embed),
                    "quote": self._parse_quote(embed),
                    "like_count": post.get("likeCount", 0),
                    "repost_count": post.get("repostCount", 0),
                    "reply_count": post.get("replyCount", 0),
                    "viewer_like": (
                        post.get("viewer", {}).get("like", "")
                    ),
                    "viewer_repost": (
                        post.get("viewer", {}).get("repost", "")
                    ),
                    "is_repost": is_repost,
                    "reposted_by": reposted_by,
                    "is_reply": bool(reply_parent_author.get("handle")),
                    "reply_to_handle": reply_parent_author.get(
                        "handle", ""
                    ),
                    "reply_to_name": (
                        reply_parent_author.get("displayName")
                        or reply_parent_author.get("handle", "")
                    ),
                }
            )
        return posts

    async def async_like_post(self, uri: str, cid: str) -> str:
        """Like a post. Returns the record URI of the like."""
        if not self._access_jwt:
            await self._create_session()

        url = f"{PDSHOST}/xrpc/com.atproto.repo.createRecord"
        payload = {
            "repo": self._did,
            "collection": "app.bsky.feed.like",
            "record": {
                "$type": "app.bsky.feed.like",
                "subject": {"uri": uri, "cid": cid},
                "createdAt": datetime.now(timezone.utc).isoformat(),
            },
        }
        result = await self._api_post(url, payload)
        return result.get("uri", "")

    async def async_unlike_post(self, record_uri: str) -> None:
        """Remove a like by its record URI."""
        if not self._access_jwt:
            await self._create_session()

        rkey = record_uri.rsplit("/", 1)[-1]
        url = f"{PDSHOST}/xrpc/com.atproto.repo.deleteRecord"
        payload = {
            "repo": self._did,
            "collection": "app.bsky.feed.like",
            "rkey": rkey,
        }
        await self._api_post(url, payload)

    async def async_repost_post(self, uri: str, cid: str) -> str:
        """Repost a post. Returns the record URI of the repost."""
        if not self._access_jwt:
            await self._create_session()

        url = f"{PDSHOST}/xrpc/com.atproto.repo.createRecord"
        payload = {
            "repo": self._did,
            "collection": "app.bsky.feed.repost",
            "record": {
                "$type": "app.bsky.feed.repost",
                "subject": {"uri": uri, "cid": cid},
                "createdAt": datetime.now(timezone.utc).isoformat(),
            },
        }
        result = await self._api_post(url, payload)
        return result.get("uri", "")

    async def async_unrepost_post(self, record_uri: str) -> None:
        """Remove a repost by its record URI."""
        if not self._access_jwt:
            await self._create_session()

        rkey = record_uri.rsplit("/", 1)[-1]
        url = f"{PDSHOST}/xrpc/com.atproto.repo.deleteRecord"
        payload = {
            "repo": self._did,
            "collection": "app.bsky.feed.repost",
            "rkey": rkey,
        }
        await self._api_post(url, payload)

    async def _async_update_data(self) -> list[dict[str, Any]]:
        """Fetch feed data from Bluesky."""
        if not self._access_jwt:
            await self._create_session()

        try:
            if self._feed_type == FEED_TYPE_CUSTOM and self._feed_uri:
                data = await self._fetch_custom_feed()
            elif self._feed_type == FEED_TYPE_TIMELINE:
                data = await self._fetch_timeline()
            else:
                data = await self._fetch_author_feed()
            return self._parse_feed(data)
        except UpdateFailed:
            raise
        except Exception as err:
            raise UpdateFailed(
                f"Error fetching Bluesky feed: {err}"
            ) from err
