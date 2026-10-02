package com.commit.project2.controller;

import com.commit.project2.service.RegionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/region")
public class RegionApiController {
  private final RegionService regionService;


}
