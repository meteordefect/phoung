import httpx

from config import GITHUB_TOKEN

GITHUB_API = "https://api.github.com"


def _headers() -> dict:
    return {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _repo_from_url(repo_url: str) -> str:
    """Extract 'owner/repo' from a GitHub URL."""
    repo_url = repo_url.rstrip("/").removesuffix(".git")
    parts = repo_url.split("/")
    return f"{parts[-2]}/{parts[-1]}"


def check_prs(repo_url: str) -> list[dict]:
    repo = _repo_from_url(repo_url)
    resp = httpx.get(f"{GITHUB_API}/repos/{repo}/pulls", headers=_headers(), params={"state": "open"}, timeout=30)
    resp.raise_for_status()
    prs = []
    for pr in resp.json():
        checks = get_checks(repo, pr["head"]["sha"])
        prs.append({
            "number": pr["number"],
            "title": pr["title"],
            "branch": pr["head"]["ref"],
            "state": pr["state"],
            "checks": checks,
            "url": pr["html_url"],
        })
    return prs


def get_checks(repo: str, sha: str) -> list[dict]:
    resp = httpx.get(f"{GITHUB_API}/repos/{repo}/commits/{sha}/check-runs", headers=_headers(), timeout=30)
    if resp.status_code != 200:
        return []
    return [
        {"name": c["name"], "status": c["status"], "conclusion": c.get("conclusion")}
        for c in resp.json().get("check_runs", [])
    ]


def merge_pr(repo_url: str, pr_number: int):
    repo = _repo_from_url(repo_url)
    resp = httpx.put(
        f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}/merge",
        headers=_headers(),
        json={"merge_method": "squash"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def close_pr(repo_url: str, pr_number: int):
    repo = _repo_from_url(repo_url)
    resp = httpx.patch(
        f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}",
        headers=_headers(),
        json={"state": "closed"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def get_pr_details(repo_url: str, pr_number: int) -> dict:
    repo = _repo_from_url(repo_url)
    pr_resp = httpx.get(f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}", headers=_headers(), timeout=30)
    pr_resp.raise_for_status()
    pr_data = pr_resp.json()

    files_resp = httpx.get(f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}/files", headers=_headers(), timeout=30)
    files = []
    if files_resp.status_code == 200:
        files = [
            {
                "filename": f["filename"],
                "status": f["status"],
                "additions": f["additions"],
                "deletions": f["deletions"],
            }
            for f in files_resp.json()
        ]

    checks = get_checks(repo, pr_data["head"]["sha"])

    return {
        "title": pr_data["title"],
        "url": pr_data["html_url"],
        "branch": pr_data["head"]["ref"],
        "files": files,
        "checks": checks,
        "additions": pr_data.get("additions", 0),
        "deletions": pr_data.get("deletions", 0),
        "changed_files": pr_data.get("changed_files", 0),
    }


def get_pr_diff(repo_url: str, pr_number: int) -> str:
    repo = _repo_from_url(repo_url)
    headers = _headers()
    headers["Accept"] = "application/vnd.github.v3.diff"
    resp = httpx.get(f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}", headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.text


def read_repo_tree(repo_url: str, path: str = "", ref: str = "main") -> list[dict]:
    repo = _repo_from_url(repo_url)
    resp = httpx.get(
        f"{GITHUB_API}/repos/{repo}/contents/{path}",
        headers=_headers(),
        params={"ref": ref},
        timeout=30,
    )
    resp.raise_for_status()
    items = resp.json()
    if not isinstance(items, list):
        items = [items]
    return [{"name": i["name"], "type": i["type"], "path": i["path"]} for i in items]


def read_repo_file(repo_url: str, path: str, ref: str = "main") -> str:
    repo = _repo_from_url(repo_url)
    headers = _headers()
    headers["Accept"] = "application/vnd.github.v3.raw"
    resp = httpx.get(
        f"{GITHUB_API}/repos/{repo}/contents/{path}",
        headers=headers,
        params={"ref": ref},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.text
