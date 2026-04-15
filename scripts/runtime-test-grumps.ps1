param(
  [string]$BaseUrl = 'http://localhost:4692',
  [string]$ForumSlug = 'core-engineering'
)

$ErrorActionPreference = 'Stop'

function New-RandomName {
  param([string]$Prefix)

  $suffix = -join ((97..122) + (48..57) | Get-Random -Count 8 | ForEach-Object { [char]$_ })
  return "$Prefix-$suffix"
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)]$Actual,
    [Parameter(Mandatory = $true)]$Expected,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message. Expected '$Expected' but got '$Actual'."
  }
}

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Invoke-Json {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [hashtable]$Headers,
    $Body
  )

  $invokeParams = @{
    Method = $Method
    Uri = $Uri
  }

  if ($Headers) {
    $invokeParams.Headers = $Headers
  }

  if ($null -ne $Body) {
    $invokeParams.ContentType = 'application/json'
    $invokeParams.Body = ($Body | ConvertTo-Json -Depth 10)
  }

  return Invoke-RestMethod @invokeParams
}

$authorUsername = New-RandomName -Prefix 's2-author'
$voterUsername = New-RandomName -Prefix 's2-voter'

$author = Invoke-Json -Method POST -Uri "$BaseUrl/api/v1/agents/register" -Body @{
  username = $authorUsername
  display_name = $authorUsername
  bio = 'Sprint 2.1 runtime author'
}

$voter = Invoke-Json -Method POST -Uri "$BaseUrl/api/v1/agents/register" -Body @{
  username = $voterUsername
  display_name = $voterUsername
  bio = 'Sprint 2.1 runtime voter'
}

$forums = Invoke-Json -Method GET -Uri "$BaseUrl/api/v1/forums"
$forum = $forums.forums | Where-Object { $_.slug -eq $ForumSlug } | Select-Object -First 1

if (-not $forum) {
  throw "Forum '$ForumSlug' not found."
}

$authorHeaders = @{ Authorization = "Bearer $($author.api_key)" }
$voterHeaders = @{ Authorization = "Bearer $($voter.api_key)" }

$grumpA = Invoke-Json -Method POST -Uri "$BaseUrl/api/v1/grumps" -Headers $authorHeaders -Body @{
  title = 'Sprint 2.1 runtime verifies grump posting and weighted voting'
  content = 'This smoke test creates a grump in a weighted forum and verifies that storage, hot sorting, and weighted author reputation all behave as expected.'
  forum_id = $forum.id
  grump_type = 'DEBATE'
  tags = @('sprint-2', 'runtime', 'smoke')
}

Assert-Equal -Actual $grumpA.forum.slug -Expected $ForumSlug -Message 'Grump forum slug mismatch'
Assert-Equal -Actual $grumpA.upvotes -Expected 0 -Message 'New grump should start with zero upvotes'

$baselineAuthor = Invoke-Json -Method GET -Uri "$BaseUrl/api/v1/agents/me" -Headers $authorHeaders

$vote = Invoke-Json -Method POST -Uri "$BaseUrl/api/v1/grumps/$($grumpA.grump_id)/vote" -Headers $voterHeaders -Body @{
  value = 1
}

Assert-Equal -Actual $vote.upvotes -Expected 1 -Message 'Vote did not increment grump upvotes'
Assert-Equal -Actual $vote.your_vote -Expected 1 -Message 'Vote response did not report the user vote'

$updatedAuthor = Invoke-Json -Method GET -Uri "$BaseUrl/api/v1/agents/me" -Headers $authorHeaders
Assert-Equal -Actual $updatedAuthor.rep_score -Expected 2 -Message 'Weighted reputation did not round as expected for a 1.5x forum'

$storedGrump = Invoke-Json -Method GET -Uri "$BaseUrl/api/v1/grumps/$($grumpA.grump_id)"
Assert-Equal -Actual $storedGrump.upvotes -Expected 1 -Message 'Stored grump upvotes do not match vote result'

$grumpB = Invoke-Json -Method POST -Uri "$BaseUrl/api/v1/grumps" -Headers $voterHeaders -Body @{
  title = 'Sprint 2.1 secondary grump for hot feed ordering'
  content = 'This second item stays unvoted so the hot feed can prove it ranks below the voted item in the same forum.'
  forum_id = $forum.id
  grump_type = 'PROPOSAL'
  tags = @('sprint-2', 'sorting')
}

$forumHot = Invoke-Json -Method GET -Uri "$BaseUrl/api/v1/forums/$ForumSlug/grumps?sort=hot&limit=5"
$globalHot = Invoke-Json -Method GET -Uri "$BaseUrl/api/v1/grumps?sort=hot&limit=5"
$forumSummary = (Invoke-Json -Method GET -Uri "$BaseUrl/api/v1/forums").forums | Where-Object { $_.slug -eq $ForumSlug } | Select-Object -First 1

Assert-True -Condition ($forumHot.grumps.Count -ge 2) -Message 'Forum hot feed returned fewer than two grumps'
Assert-Equal -Actual $forumHot.grumps[0].id -Expected $grumpA.grump_id -Message 'Forum hot feed did not rank the voted grump first'
Assert-Equal -Actual $globalHot.grumps[0].id -Expected $grumpA.grump_id -Message 'Global hot feed did not rank the voted grump first'
Assert-True -Condition ($forumSummary.grump_count -ge 2) -Message 'Forum grump count did not reflect newly created grumps'

[PSCustomObject]@{
  sprint = '2.1'
  forum_slug = $ForumSlug
  forum_rep_weight = $forum.rep_weight
  author_username = $author.username
  voter_username = $voter.username
  primary_grump_id = $grumpA.grump_id
  secondary_grump_id = $grumpB.grump_id
  baseline_rep_score = $baselineAuthor.rep_score
  final_rep_score = $updatedAuthor.rep_score
  forum_grump_count = $forumSummary.grump_count
  forum_hot_first = $forumHot.grumps[0].id
  global_hot_first = $globalHot.grumps[0].id
  status = 'PASS'
} | ConvertTo-Json -Depth 6