from .nodes.io_files import NodeForgeLoadFile, read_text_sections

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {
    "NodeForgeLoadFile": NodeForgeLoadFile,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NodeForgeLoadFile": "NodeForge: Load File",
}


def _register_routes():
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/nodeforge/load_file/sections")
    async def load_file_sections(request):
        try:
            sections = read_text_sections(request.query.get("path", ""))
        except (ValueError, FileNotFoundError) as e:
            return web.json_response({"error": str(e)}, status=400)
        return web.json_response(sections)


_register_routes()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
