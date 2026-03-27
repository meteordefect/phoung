import { Octokit } from "@octokit/rest";
import { GITHUB_TOKEN } from "./config.js";

function getOctokit() {
  return new Octokit({ auth: GITHUB_TOKEN });
}

function parseRepo(repoUrl: string): { owner: string; repo: string } {
  const cleaned = repoUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
}

export async function checkPrs(repoUrl: string) {
  const { owner, repo } = parseRepo(repoUrl);
  const octokit = getOctokit();
  const { data: prs } = await octokit.pulls.list({ owner, repo, state: "open" });
  const results = [];
  for (const pr of prs) {
    const checks = await getChecks(repoUrl, pr.head.sha);
    results.push({
      number: pr.number,
      title: pr.title,
      branch: pr.head.ref,
      state: pr.state,
      checks,
      url: pr.html_url,
    });
  }
  return results;
}

export async function getChecks(repoUrl: string, sha: string) {
  const { owner, repo } = parseRepo(repoUrl);
  const octokit = getOctokit();
  try {
    const { data } = await octokit.checks.listForRef({ owner, repo, ref: sha });
    return data.check_runs.map(c => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
    }));
  } catch {
    return [];
  }
}

export async function mergePr(repoUrl: string, prNumber: number) {
  const { owner, repo } = parseRepo(repoUrl);
  const octokit = getOctokit();
  const { data } = await octokit.pulls.merge({ owner, repo, pull_number: prNumber, merge_method: "squash" });
  return data;
}

export async function closePr(repoUrl: string, prNumber: number) {
  const { owner, repo } = parseRepo(repoUrl);
  const octokit = getOctokit();
  const { data } = await octokit.pulls.update({ owner, repo, pull_number: prNumber, state: "closed" });
  return data;
}

export async function getPrDetails(repoUrl: string, prNumber: number) {
  const { owner, repo } = parseRepo(repoUrl);
  const octokit = getOctokit();

  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

  let files: { filename: string; status: string; additions: number; deletions: number }[] = [];
  try {
    const { data: filesData } = await octokit.pulls.listFiles({ owner, repo, pull_number: prNumber });
    files = filesData.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    }));
  } catch {}

  const checks = await getChecks(repoUrl, pr.head.sha);

  return {
    title: pr.title,
    url: pr.html_url,
    branch: pr.head.ref,
    files,
    checks,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changed_files: pr.changed_files ?? 0,
  };
}
